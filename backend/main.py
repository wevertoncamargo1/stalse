import csv
import json
import logging
import os
import sqlite3
import threading
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, TypedDict

import requests
import turso_serverless
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = (
    BACKEND_DIR.parent
    if (BACKEND_DIR.parent / "data").is_dir()
    else BACKEND_DIR
)
DATA_DIR = ROOT / "data" / "raw"
DB_PATH = Path(os.getenv("DATABASE_PATH", str(BACKEND_DIR / "db.sqlite")))
METRICS_FILE = ROOT / "data" / "processed" / "metrics.json"
ACTIVITY_LOG_FILE = Path(
    os.getenv(
        "ACTIVITY_LOG_PATH",
        str(
            Path(os.getenv("TMPDIR", "/tmp")) / "stalse-activity.jsonl"
            if os.getenv("VERCEL")
            else ROOT / "data" / "processed" / "activity.jsonl"
        ),
    )
)
N8N_URL = os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678/webhook/stalse-ticket")
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
REMOTE_DATABASE_ENABLED = bool(TURSO_DATABASE_URL or TURSO_AUTH_TOKEN)
REMOTE_DATASET_VERSION = "olist-orders-v1"
TICKET_LIFECYCLE_VERSION = "ticket-lifecycle-v1"
ACTIVITY_LOG_LIMIT = 200
ACTIVITY_LOG_WINDOW_MINUTES = 15
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
if "https://stalse-web.vercel.app" not in CORS_ORIGINS:
    CORS_ORIGINS.append("https://stalse-web.vercel.app")
logger = logging.getLogger(__name__)
activity_log_lock = threading.Lock()
DatabaseConnection = sqlite3.Connection | turso_serverless.Connection


class BoardColumn(TypedDict):
    tickets: list[dict]
    total: int

CSV_TABLES = {
    "customers": (
        "olist_customers_dataset.csv",
        (
            "customer_id",
            "customer_unique_id",
            "customer_zip_code_prefix",
            "customer_city",
            "customer_state",
        ),
    ),
    "products": (
        "olist_products_dataset.csv",
        ("product_id", "product_category_name"),
    ),
    "category_translations": (
        "product_category_name_translation.csv",
        ("product_category_name", "product_category_name_english"),
    ),
    "order_items": (
        "olist_order_items_dataset.csv",
        ("order_id", "product_id", "price", "freight_value"),
    ),
    "order_reviews": (
        "olist_order_reviews_dataset.csv",
        (
            "review_id",
            "order_id",
            "review_score",
            "review_comment_title",
            "review_comment_message",
        ),
    ),
    "order_payments": (
        "olist_order_payments_dataset.csv",
        ("order_id", "payment_type", "payment_value"),
    ),
}

ORDERS_FILE = DATA_DIR / "olist_orders_dataset.csv"
ORDER_STATUSES = (
    "created",
    "processing",
    "approved",
    "unavailable",
    "invoiced",
    "shipped",
    "canceled",
    "delivered",
)

app = FastAPI(title="Stalse Ticket API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_api_request(request: Request, call_next):
    if request.url.path not in {"/tickets", "/tickets/board", "/metrics"} and not (
        request.url.path.startswith("/tickets/")
    ):
        return await call_next(request)

    started_at = time.perf_counter()
    actor = request.headers.get("x-operator-name", "").strip()[:80] or None
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("API request failed: %s %s", request.method, request.url.path)
        try:
            write_activity_log(
                {"outcome": "exception"},
                event_type="api_request",
                actor=actor,
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=round((time.perf_counter() - started_at) * 1000),
            )
        except Exception:
            logger.exception("Could not persist failed API request activity")
        raise

    try:
        write_activity_log(
            {},
            event_type="api_request",
            actor=actor,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round((time.perf_counter() - started_at) * 1000),
        )
    except Exception:
        logger.exception("Could not persist API request activity")
    return response


def get_local_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.create_function("normalize_text", 1, normalize_text)
    return conn


def get_remote_connection() -> turso_serverless.Connection:
    if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
        raise RuntimeError(
            "Both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required "
            "when using the remote database."
        )
    conn = turso_serverless.connect(
        TURSO_DATABASE_URL,
        auth_token=TURSO_AUTH_TOKEN,
    )
    conn.row_factory = turso_serverless.Row
    return conn


def get_connection() -> DatabaseConnection:
    if REMOTE_DATABASE_ENABLED:
        return get_remote_connection()
    return get_local_connection()


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def table_count(conn: DatabaseConnection, table: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def import_csv(
    conn: DatabaseConnection,
    path: Path,
    table: str,
    columns: tuple[str, ...],
) -> None:
    if table_count(conn, table):
        return
    if not path.is_file():
        raise RuntimeError(
            f"Dataset table not found: {path}. "
            "See README.md for Kaggle download instructions."
        )

    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or not set(columns).issubset(reader.fieldnames):
            missing = sorted(set(columns) - set(reader.fieldnames or []))
            raise RuntimeError(
                f"CSV {path.name} is missing required columns: {', '.join(missing)}"
            )
        placeholders = ", ".join("?" for _ in columns)
        column_names = ", ".join(columns)
        statement = f"INSERT INTO {table} ({column_names}) VALUES ({placeholders})"
        batch = []
        for row in reader:
            batch.append(tuple(row[column] or None for column in columns))
            if len(batch) >= 2000:
                conn.executemany(statement, batch)
                batch.clear()
        if batch:
            conn.executemany(statement, batch)


def ensure_order_columns(conn: DatabaseConnection) -> None:
    existing = {
        row["name"] for row in conn.execute("PRAGMA table_info(orders)").fetchall()
    }
    new_columns = {
        "customer_unique_id": "TEXT",
        "customer_city": "TEXT",
        "customer_city_search": "TEXT",
        "customer_state": "TEXT",
        "product_categories": "TEXT",
        "item_count": "INTEGER",
        "items_total": "REAL",
        "freight_total": "REAL",
        "payment_total": "REAL",
        "payment_types": "TEXT",
        "review_score": "REAL",
        "review_count": "INTEGER",
        "review_comments": "TEXT",
        "status": "TEXT CHECK (status IS NULL OR status IN ('open', 'in_progress', 'closed'))",
        "priority": "TEXT CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'))",
        "updated_at": "TEXT",
    }
    for column, definition in new_columns.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE orders ADD COLUMN {column} {definition}")


def create_schema(conn: DatabaseConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL,
            order_status TEXT NOT NULL,
            order_purchase_timestamp TEXT NOT NULL,
            order_approved_at TEXT,
            order_delivered_carrier_date TEXT,
            order_delivered_customer_date TEXT,
            order_estimated_delivery_date TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            customer_id TEXT PRIMARY KEY,
            customer_unique_id TEXT,
            customer_zip_code_prefix TEXT,
            customer_city TEXT,
            customer_state TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            product_id TEXT PRIMARY KEY,
            product_category_name TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS category_translations (
            product_category_name TEXT PRIMARY KEY,
            product_category_name_english TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            product_id TEXT,
            price REAL,
            freight_value REAL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS order_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_id TEXT,
            order_id TEXT NOT NULL,
            review_score INTEGER,
            review_comment_title TEXT,
            review_comment_message TEXT
        )
        """
    )
    review_columns = conn.execute("PRAGMA table_info(order_reviews)").fetchall()
    if any(row["name"] == "review_id" and row["pk"] for row in review_columns):
        if table_count(conn, "order_reviews"):
            raise RuntimeError(
                "The local reviews table has an incompatible unique review_id constraint. "
                "Back up backend/db.sqlite, then recreate it from the Kaggle CSVs."
            )
        conn.execute("DROP TABLE order_reviews")
        conn.execute(
            """
            CREATE TABLE order_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                review_id TEXT,
                order_id TEXT NOT NULL,
                review_score INTEGER,
                review_comment_title TEXT,
                review_comment_message TEXT
            )
            """
        )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS order_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL,
            payment_type TEXT,
            payment_value REAL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dataset_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    create_activity_log_schema(conn)
    ensure_order_columns(conn)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_purchase ON orders(order_purchase_timestamp DESC, id DESC)"
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_orders_board_priority
        ON orders(
            order_status,
            CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
            order_purchase_timestamp DESC,
            id DESC
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_orders_lifecycle_priority
        ON orders(status, priority, order_purchase_timestamp DESC, id DESC)
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_city_search ON orders(customer_city_search)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_customer_location ON orders(customer_city, customer_state)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_order_reviews_order ON order_reviews(order_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id)")
    create_order_fts(conn)


def create_order_fts(conn: DatabaseConnection) -> None:
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS orders_fts USING fts5(
            order_id,
            customer_id,
            order_status,
            customer_unique_id,
            customer_city,
            customer_city_search,
            customer_state,
            product_categories,
            review_comments,
            tokenize='trigram'
        )
        """
    )


def rebuild_order_fts(conn: DatabaseConnection) -> None:
    conn.execute(
        "UPDATE orders SET customer_city_search = normalize_text(customer_city)"
    )
    conn.execute("DELETE FROM orders_fts")
    conn.execute(
        """
        INSERT INTO orders_fts (
            rowid, order_id, customer_id, order_status, customer_unique_id,
            customer_city, customer_city_search, customer_state, product_categories,
            review_comments
        )
        SELECT
            id, order_id, customer_id, order_status, customer_unique_id,
            customer_city, customer_city_search, customer_state, product_categories,
            review_comments
        FROM orders
        """
    )


def create_remote_schema(conn: turso_serverless.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY,
            order_id TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL,
            order_status TEXT NOT NULL,
            order_purchase_timestamp TEXT NOT NULL,
            order_approved_at TEXT,
            order_delivered_carrier_date TEXT,
            order_delivered_customer_date TEXT,
            order_estimated_delivery_date TEXT,
            customer_unique_id TEXT,
            customer_city TEXT,
            customer_city_search TEXT,
            customer_state TEXT,
            product_categories TEXT,
            item_count INTEGER,
            items_total REAL,
            freight_total REAL,
            payment_total REAL,
            payment_types TEXT,
            review_score REAL,
            review_count INTEGER,
            review_comments TEXT,
            status TEXT,
            priority TEXT,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dataset_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    create_activity_log_schema(conn)
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_orders_purchase
        ON orders(order_purchase_timestamp DESC, id DESC)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_orders_status_priority_purchase
        ON orders(order_status, priority, order_purchase_timestamp DESC, id DESC)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_orders_lifecycle_priority
        ON orders(status, priority, order_purchase_timestamp DESC, id DESC)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_orders_city_search
        ON orders(customer_city_search)
        """
    )


def create_activity_log_schema(conn: DatabaseConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            actor TEXT,
            method TEXT,
            path TEXT,
            status_code INTEGER,
            duration_ms INTEGER,
            ticket_id INTEGER,
            order_id TEXT,
            details_json TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_activity_logs_created
        ON activity_logs(created_at DESC, id DESC)
        """
    )


def initialize_ticket_lifecycle(conn: DatabaseConnection) -> None:
    lifecycle = conn.execute(
        "SELECT value FROM dataset_metadata WHERE key = ?",
        (TICKET_LIFECYCLE_VERSION,),
    ).fetchone()
    if lifecycle is None:
        conn.execute(
            """
            UPDATE orders
            SET status = CASE
                WHEN order_status IN ('delivered', 'canceled') THEN 'closed'
                ELSE 'open'
            END,
            priority = NULL,
            updated_at = NULL
            """
        )
        conn.execute(
            "INSERT INTO dataset_metadata (key, value) VALUES (?, '1')",
            (TICKET_LIFECYCLE_VERSION,),
        )


def write_activity_log(
    event: dict,
    *,
    event_type: str,
    actor: str | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    duration_ms: int | None = None,
    ticket_id: int | None = None,
    order_id: str | None = None,
) -> None:
    created_at = iso_now()
    event_record = {
        "created_at": created_at,
        "event_type": event_type,
        "actor": actor,
        "method": method,
        "path": path,
        "status_code": status_code,
        "duration_ms": duration_ms,
        "ticket_id": ticket_id,
        "order_id": order_id,
        "details": event,
    }
    conn = get_connection()
    try:
        insert_activity_row(conn, event_record)
        conn.commit()
    finally:
        conn.close()

    append_activity_file(event_record)


def insert_activity_row(conn: DatabaseConnection, event_record: dict) -> None:
    conn.execute(
        """
        INSERT INTO activity_logs (
            created_at, event_type, actor, method, path, status_code,
            duration_ms, ticket_id, order_id, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_record["created_at"],
            event_record["event_type"],
            event_record["actor"],
            event_record["method"],
            event_record["path"],
            event_record["status_code"],
            event_record["duration_ms"],
            event_record["ticket_id"],
            event_record["order_id"],
            json.dumps(event_record["details"], ensure_ascii=False),
        ),
    )


def append_activity_file(event_record: dict) -> None:
    try:
        ACTIVITY_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with activity_log_lock, ACTIVITY_LOG_FILE.open(
            "a", encoding="utf-8", newline="\n"
        ) as output:
            output.write(json.dumps(event_record, ensure_ascii=False) + "\n")
    except OSError:
        logger.exception("Could not append activity event to %s", ACTIVITY_LOG_FILE)


def recent_activity_logs(conn: DatabaseConnection) -> list[dict]:
    threshold = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() - ACTIVITY_LOG_WINDOW_MINUTES * 60,
        tz=timezone.utc,
    ).strftime("%Y-%m-%dT%H:%M:%S")
    rows = conn.execute(
        """
        SELECT created_at, event_type, actor, method, path, status_code,
               duration_ms, ticket_id, order_id, details_json
        FROM activity_logs
        WHERE created_at >= ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (threshold, ACTIVITY_LOG_LIMIT),
    ).fetchall()
    return [
        {
            "created_at": row["created_at"],
            "event_type": row["event_type"],
            "actor": row["actor"],
            "method": row["method"],
            "path": row["path"],
            "status_code": row["status_code"],
            "duration_ms": row["duration_ms"],
            "ticket_id": row["ticket_id"],
            "order_id": row["order_id"],
            "details": json.loads(row["details_json"]),
        }
        for row in rows
    ]


def create_enrichment_tables(conn: DatabaseConnection) -> None:
    conn.execute("DROP TABLE IF EXISTS temp.order_enrichment")
    conn.execute(
        """
        CREATE TEMP TABLE order_enrichment AS
        SELECT
            items.order_id,
            COUNT(*) AS item_count,
            SUM(items.price) AS items_total,
            SUM(items.freight_value) AS freight_total,
            GROUP_CONCAT(DISTINCT products.product_category_name) AS product_categories
        FROM order_items AS items
        LEFT JOIN products ON products.product_id = items.product_id
        LEFT JOIN category_translations AS translations
            ON translations.product_category_name = products.product_category_name
        GROUP BY items.order_id
        """
    )
    conn.execute("CREATE UNIQUE INDEX temp.idx_order_enrichment_id ON order_enrichment(order_id)")

    conn.execute("DROP TABLE IF EXISTS temp.payment_enrichment")
    conn.execute(
        """
        CREATE TEMP TABLE payment_enrichment AS
        SELECT
            order_id,
            SUM(payment_value) AS payment_total,
            GROUP_CONCAT(DISTINCT payment_type) AS payment_types
        FROM order_payments
        GROUP BY order_id
        """
    )
    conn.execute("CREATE UNIQUE INDEX temp.idx_payment_enrichment_id ON payment_enrichment(order_id)")

    conn.execute("DROP TABLE IF EXISTS temp.review_enrichment")
    conn.execute(
        """
        CREATE TEMP TABLE review_enrichment AS
        SELECT
            order_id,
            AVG(review_score) AS review_score,
            COUNT(review_score) AS review_count,
            SUBSTR(GROUP_CONCAT(
                NULLIF(TRIM(COALESCE(review_comment_title, '') || ' ' || COALESCE(review_comment_message, '')), ''),
                ' | '
            ), 1, 1200) AS review_comments
        FROM order_reviews
        GROUP BY order_id
        """
    )
    conn.execute("CREATE UNIQUE INDEX temp.idx_review_enrichment_id ON review_enrichment(order_id)")

    conn.execute(
        """
        UPDATE orders
        SET
            customer_unique_id = (
                SELECT customer_unique_id FROM customers WHERE customers.customer_id = orders.customer_id
            ),
            customer_city = (
                SELECT customer_city FROM customers WHERE customers.customer_id = orders.customer_id
            ),
            customer_state = (
                SELECT customer_state FROM customers WHERE customers.customer_id = orders.customer_id
            ),
            product_categories = (
                SELECT product_categories FROM order_enrichment WHERE order_enrichment.order_id = orders.order_id
            ),
            item_count = (
                SELECT item_count FROM order_enrichment WHERE order_enrichment.order_id = orders.order_id
            ),
            items_total = (
                SELECT items_total FROM order_enrichment WHERE order_enrichment.order_id = orders.order_id
            ),
            freight_total = (
                SELECT freight_total FROM order_enrichment WHERE order_enrichment.order_id = orders.order_id
            ),
            payment_total = (
                SELECT payment_total FROM payment_enrichment WHERE payment_enrichment.order_id = orders.order_id
            ),
            payment_types = (
                SELECT payment_types FROM payment_enrichment WHERE payment_enrichment.order_id = orders.order_id
            ),
            review_score = (
                SELECT review_score FROM review_enrichment WHERE review_enrichment.order_id = orders.order_id
            ),
            review_count = (
                SELECT review_count FROM review_enrichment WHERE review_enrichment.order_id = orders.order_id
            ),
            review_comments = (
                SELECT review_comments FROM review_enrichment WHERE review_enrichment.order_id = orders.order_id
            )
        WHERE customer_city IS NULL
           OR product_categories IS NULL
           OR payment_total IS NULL
           OR review_count IS NULL
        """
    )
    rebuild_order_fts(conn)


def ensure_db() -> None:
    if not ORDERS_FILE.is_file():
        raise RuntimeError(
            f"Orders dataset not found: {ORDERS_FILE}. "
            "Download the Olist CSV files listed in README.md."
        )

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_local_connection()
    try:
        create_schema(conn)
        orders_columns = (
            "order_id",
            "customer_id",
            "order_status",
            "order_purchase_timestamp",
            "order_approved_at",
            "order_delivered_carrier_date",
            "order_delivered_customer_date",
            "order_estimated_delivery_date",
        )
        if table_count(conn, "orders") == 0:
            import_csv(conn, ORDERS_FILE, "orders", orders_columns)

        for table, (filename, columns) in CSV_TABLES.items():
            import_csv(conn, DATA_DIR / filename, table, columns)

        enriched = conn.execute(
            "SELECT value FROM dataset_metadata WHERE key = 'orders_enriched'"
        ).fetchone()
        if enriched is None:
            create_enrichment_tables(conn)
            conn.execute(
                "INSERT INTO dataset_metadata (key, value) VALUES ('orders_enriched', '1')"
            )
        triage_migration = conn.execute(
            "SELECT value FROM dataset_metadata WHERE key = 'triage_values_are_manual'"
        ).fetchone()
        if triage_migration is None:
            conn.execute(
                "UPDATE orders SET status = NULL, priority = NULL, updated_at = NULL"
            )
            conn.execute(
                """
                INSERT INTO dataset_metadata (key, value)
                VALUES ('triage_values_are_manual', '1')
                """
            )
        category_language = conn.execute(
            "SELECT value FROM dataset_metadata WHERE key = 'category_names_in_portuguese'"
        ).fetchone()
        if category_language is None:
            conn.execute(
                """
                UPDATE orders
                SET product_categories = (
                    SELECT GROUP_CONCAT(DISTINCT products.product_category_name)
                    FROM order_items
                    JOIN products ON products.product_id = order_items.product_id
                    WHERE order_items.order_id = orders.order_id
                )
                WHERE EXISTS (
                    SELECT 1 FROM order_items
                    WHERE order_items.order_id = orders.order_id
                )
                """
            )
            conn.execute(
                """
                INSERT INTO dataset_metadata (key, value)
                VALUES ('category_names_in_portuguese', '1')
                """
            )
        city_search = conn.execute(
            "SELECT value FROM dataset_metadata WHERE key = 'accent_insensitive_city_search'"
        ).fetchone()
        if city_search is None:
            conn.execute("DROP TABLE orders_fts")
            create_order_fts(conn)
            rebuild_order_fts(conn)
            conn.execute(
                """
                INSERT INTO dataset_metadata (key, value)
                VALUES ('accent_insensitive_city_search', '1')
                """
            )
        initialize_ticket_lifecycle(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_remote_db() -> None:
    conn = get_remote_connection()
    try:
        create_activity_log_schema(conn)
        metadata = conn.execute(
            """
            SELECT key, value FROM dataset_metadata
            WHERE key IN ('remote_seed_version', 'review_metrics', ?)
            """,
            (TICKET_LIFECYCLE_VERSION,),
        ).fetchall()
        values = {row["key"]: row["value"] for row in metadata}
        seed = values.get("remote_seed_version")
        if seed != REMOTE_DATASET_VERSION:
            raise RuntimeError(
                "The remote orders database is not initialized. "
                "Run `python backend/seed_turso.py` from the project root."
            )
        metrics = values.get("review_metrics")
        if metrics is None:
            raise RuntimeError(
                "The remote database is missing review metrics. "
                "Run `python backend/seed_turso.py --replace` from the project root."
            )
        if not isinstance(json.loads(metrics), dict):
            raise RuntimeError("The remote review metrics must contain a JSON object.")
        initialize_ticket_lifecycle(conn)
        conn.commit()
    finally:
        conn.close()


def serialize_order(row: sqlite3.Row | turso_serverless.Row) -> dict:
    return {key: row[key] for key in row.keys()}


def ticket_filters(
    search_term: str,
    status: str | None = None,
    ticket_status: str | None = None,
    priority: str | None = None,
) -> tuple[str, list[str]]:
    filters = []
    parameters = []
    if status:
        filters.append("orders.order_status = ?")
        parameters.append(status)
    if ticket_status:
        filters.append("orders.status = ?")
        parameters.append(ticket_status)
    if priority:
        if priority == "none":
            filters.append("orders.priority IS NULL")
        else:
            filters.append("orders.priority = ?")
            parameters.append(priority)
    if search_term:
        normalized_city = normalize_text(search_term)
        if len(search_term) >= 3:
            if REMOTE_DATABASE_ENABLED:
                filters.append(
                    """
                    (orders.order_id LIKE ? OR orders.customer_id LIKE ?
                     OR orders.order_status LIKE ? OR orders.customer_unique_id LIKE ?
                     OR orders.customer_city_search LIKE ? OR orders.customer_state LIKE ?
                     OR orders.product_categories LIKE ? OR orders.review_comments LIKE ?)
                    """
                )
            else:
                filters.append(
                    """
                    orders.id IN (
                        SELECT rowid FROM orders_fts
                        WHERE order_id LIKE ? OR customer_id LIKE ? OR order_status LIKE ?
                           OR customer_unique_id LIKE ? OR customer_city_search LIKE ?
                           OR customer_state LIKE ? OR product_categories LIKE ?
                           OR review_comments LIKE ?
                    )
                    """
                )
            parameters.extend(
                [
                    f"%{search_term}%",
                    f"%{search_term}%",
                    f"%{search_term}%",
                    f"%{search_term}%",
                    f"%{normalized_city}%",
                    f"%{search_term}%",
                    f"%{search_term}%",
                    f"%{search_term}%",
                ]
            )
        else:
            filters.append(
                """
                (orders.order_id LIKE ? OR orders.customer_id LIKE ?
                 OR orders.customer_unique_id LIKE ? OR orders.order_status LIKE ?
                 OR orders.customer_city_search LIKE ?)
                """
            )
            parameters.extend([f"{search_term}%"] * 4 + [f"{normalized_city}%"])
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    return where_clause, parameters


def ticket_page(
    conn: DatabaseConnection,
    search_term: str,
    status: str | None,
    limit: int,
    offset: int,
    ticket_status: str | None = None,
    priority: str | None = None,
) -> tuple[list[dict], int]:
    where_clause, parameters = ticket_filters(
        search_term, status, ticket_status, priority
    )
    if REMOTE_DATABASE_ENABLED:
        rows = conn.execute(
            f"""
            SELECT orders.*, COUNT(*) OVER() AS _page_total
            FROM orders
            {where_clause}
            ORDER BY
                CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
                order_purchase_timestamp DESC,
                id DESC
            LIMIT ? OFFSET ?
            """,
            (*parameters, limit, offset),
        ).fetchall()
        total = rows[0]["_page_total"] if rows else 0
        tickets = []
        for row in rows:
            ticket = serialize_order(row)
            ticket.pop("_page_total")
            tickets.append(ticket)
        return tickets, total

    total = conn.execute(
        f"SELECT COUNT(*) FROM orders {where_clause}", tuple(parameters)
    ).fetchone()[0]
    rows = conn.execute(
        f"""
        SELECT * FROM orders
        {where_clause}
        ORDER BY
            CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
            order_purchase_timestamp DESC,
            id DESC
        LIMIT ? OFFSET ?
        """,
        (*parameters, limit, offset),
    ).fetchall()
    return [serialize_order(row) for row in rows], total


def trigger_n8n(ticket: dict, actor: str, triggers: list[str]) -> None:
    conn = get_connection()
    try:
        logs = recent_activity_logs(conn)
    finally:
        conn.close()
    payload = {
        "event": "ticket_review_requested",
        "triggers": triggers,
        "actor": actor,
        "ticket_id": ticket["id"],
        "order_id": ticket["order_id"],
        "ticket_status": ticket["status"],
        "order_status": ticket["order_status"],
        "priority": ticket["priority"],
        "updated_at": ticket["updated_at"],
        "logs_window_minutes": ACTIVITY_LOG_WINDOW_MINUTES,
        "logs": logs,
    }
    try:
        response = requests.post(N8N_URL, json=payload, timeout=5)
        response.raise_for_status()
    except requests.RequestException:
        logger.exception("Could not deliver ticket update to n8n webhook at %s", N8N_URL)


class TicketPatch(BaseModel):
    order_status: Literal[
        "delivered",
        "shipped",
        "canceled",
        "unavailable",
        "invoiced",
        "processing",
        "created",
        "approved",
    ] | None = None
    priority: Literal["low", "medium", "high"] | None = None


@app.on_event("startup")
def startup_event() -> None:
    if REMOTE_DATABASE_ENABLED:
        ensure_remote_db()
    else:
        ensure_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/tickets")
def list_tickets(
    q: str = Query(default="", max_length=200),
    status: Literal[
        "delivered",
        "shipped",
        "canceled",
        "unavailable",
        "invoiced",
        "processing",
        "created",
        "approved",
    ] | None = None,
    ticket_status: Literal["open", "closed"] | None = None,
    priority: Literal["low", "medium", "high", "none"] | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict:
    conn = get_connection()
    tickets, total = ticket_page(
        conn, q.strip(), status, limit, offset, ticket_status, priority
    )
    conn.close()
    return {
        "tickets": tickets,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/tickets/board")
def ticket_board(
    q: str = Query(default="", max_length=200),
    ticket_status: Literal["open", "closed"] | None = None,
    priority: Literal["low", "medium", "high", "none"] | None = None,
    per_column: int = Query(default=20, ge=1, le=100),
) -> dict:
    conn = get_connection()
    columns: dict[str, BoardColumn] = {
        status: {"tickets": [], "total": 0} for status in ORDER_STATUSES
    }
    if REMOTE_DATABASE_ENABLED:
        where_clause, parameters = ticket_filters(
            q.strip(), ticket_status=ticket_status, priority=priority
        )
        rows = conn.execute(
            f"""
            WITH ranked_orders AS (
                SELECT
                    orders.*,
                    COUNT(*) OVER (PARTITION BY order_status) AS _column_total,
                    ROW_NUMBER() OVER (
                        PARTITION BY order_status
                        ORDER BY
                            CASE priority
                                WHEN 'high' THEN 0
                                WHEN 'medium' THEN 1
                                WHEN 'low' THEN 2
                                ELSE 3
                            END,
                            order_purchase_timestamp DESC,
                            id DESC
                    ) AS _column_rank
                FROM orders
                {where_clause}
            )
            SELECT *
            FROM ranked_orders
            WHERE _column_rank <= ?
            """,
            (*parameters, per_column),
        ).fetchall()
        for row in rows:
            ticket = serialize_order(row)
            status = ticket["order_status"]
            column_total = ticket.pop("_column_total")
            ticket.pop("_column_rank")
            column = columns[status]
            column["tickets"].append(ticket)
            column["total"] = column_total
        conn.close()
        return {"columns": columns, "per_column": per_column}

    for status in ORDER_STATUSES:
        tickets, total = ticket_page(
            conn,
            q.strip(),
            status,
            per_column,
            0,
            ticket_status,
            priority,
        )
        columns[status] = {"tickets": tickets, "total": total}
    conn.close()
    return {"columns": columns, "per_column": per_column}


@app.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int) -> dict:
    conn = get_connection()
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (ticket_id,)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return serialize_order(row)


@app.patch("/tickets/{ticket_id}")
def patch_ticket(
    ticket_id: int,
    payload: TicketPatch,
    background_tasks: BackgroundTasks,
    operator: str = Header(alias="X-Operator-Name", min_length=2, max_length=80),
) -> dict:
    operator = operator.strip()
    if len(operator) < 2:
        raise HTTPException(status_code=422, detail="Informe o nome do operador.")

    updates: dict[str, str | None] = {}
    if "order_status" in payload.model_fields_set:
        if payload.order_status is None:
            raise HTTPException(status_code=422, detail="order_status cannot be null")
        updates["order_status"] = payload.order_status
        updates["status"] = (
            "closed"
            if payload.order_status in {"delivered", "canceled"}
            else "open"
        )
    if "priority" in payload.model_fields_set:
        updates["priority"] = payload.priority
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    conn = get_connection()
    current = conn.execute("SELECT * FROM orders WHERE id = ?", (ticket_id,)).fetchone()
    if current is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")

    previous = serialize_order(current)
    updated_at = iso_now()
    set_clause = ", ".join(f"{column} = ?" for column in updates)
    conn.execute(
        f"UPDATE orders SET {set_clause}, updated_at = ? WHERE id = ?",
        (*updates.values(), updated_at, ticket_id),
    )
    if "order_status" in updates:
        if not REMOTE_DATABASE_ENABLED:
            conn.execute(
                "UPDATE orders_fts SET order_status = ? WHERE rowid = ?",
                (updates["order_status"], ticket_id),
            )
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (ticket_id,)).fetchone()
    ticket = serialize_order(row)

    status_changed = ticket["order_status"] != previous["order_status"]
    lifecycle_changed = ticket["status"] != previous["status"]
    priority_changed = ticket["priority"] != previous["priority"]
    event_record = {
        "created_at": updated_at,
        "event_type": "ticket_updated",
        "actor": operator,
        "method": "PATCH",
        "path": f"/tickets/{ticket_id}",
        "status_code": 200,
        "duration_ms": None,
        "ticket_id": ticket_id,
        "order_id": ticket["order_id"],
        "details": {
            "changes": {
                field: {"from": previous[field], "to": ticket[field]}
                for field in ("order_status", "status", "priority")
                if previous[field] != ticket[field]
            }
        },
    }
    if status_changed or lifecycle_changed or priority_changed:
        insert_activity_row(conn, event_record)
    conn.commit()
    conn.close()
    if status_changed or lifecycle_changed or priority_changed:
        append_activity_file(event_record)

    triggers = []
    if ticket["status"] == "closed" and previous["status"] != "closed":
        triggers.append("ticket_closed")
    if ticket["priority"] == "high" and previous["priority"] != "high":
        triggers.append("priority_high")
    if triggers:
        background_tasks.add_task(trigger_n8n, ticket, operator, triggers)
    return ticket


@app.get("/metrics")
def metrics() -> dict:
    conn = get_connection()
    if REMOTE_DATABASE_ENABLED:
        review_metrics = conn.execute(
            "SELECT value FROM dataset_metadata WHERE key = 'review_metrics'"
        ).fetchone()
        if review_metrics is None:
            conn.close()
            raise HTTPException(
                status_code=503,
                detail="Remote review metrics are missing. Seed the remote database first.",
            )
        result = json.loads(review_metrics["value"])
    else:
        if not METRICS_FILE.exists():
            conn.close()
            raise HTTPException(
                status_code=404,
                detail="Metrics file not found. Run the reviews ETL script first.",
            )
        with METRICS_FILE.open("r", encoding="utf-8") as source:
            result = json.load(source)

    total_orders = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    fulfillment_status = conn.execute(
        """
        SELECT order_status, COUNT(*) AS count
        FROM orders
        GROUP BY order_status
        ORDER BY count DESC
        """
    ).fetchall()
    ticket_status_counts = conn.execute(
        """
        SELECT status, COUNT(*) AS count
        FROM orders
        GROUP BY status
        """
    ).fetchall()
    top_cities = conn.execute(
        """
        SELECT
            customer_city AS city,
            customer_state AS state,
            COUNT(*) AS orders,
            COUNT(DISTINCT customer_unique_id) AS customers
        FROM orders
        WHERE customer_city IS NOT NULL AND customer_state IS NOT NULL
        GROUP BY customer_city, customer_state
        ORDER BY orders DESC, city
        LIMIT 10
        """
    ).fetchall()
    status_counts = {
        row["order_status"]: row["count"] for row in fulfillment_status
    }
    ticket_counts = {row["status"]: row["count"] for row in ticket_status_counts}
    result["orders"] = {
        "summary": {
            "total_orders": total_orders,
            "delivered": status_counts.get("delivered", 0),
            "canceled": status_counts.get("canceled", 0),
            "unavailable": status_counts.get("unavailable", 0),
            "open_tickets": ticket_counts.get("open", 0),
            "closed_tickets": ticket_counts.get("closed", 0),
        },
        "by_status": [
            {"status": status, "count": status_counts.get(status, 0)}
            for status in ORDER_STATUSES
        ],
        "by_ticket_status": [
            {"status": status, "count": ticket_counts.get(status, 0)}
            for status in ("open", "closed")
        ],
        "by_city": [dict(row) for row in top_cities],
    }
    conn.close()
    return result
