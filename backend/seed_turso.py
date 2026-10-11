import argparse
import json
import sqlite3

import turso_serverless

from main import (
    METRICS_FILE,
    REMOTE_DATASET_VERSION,
    create_remote_schema,
    ensure_db,
    get_local_connection,
    get_remote_connection,
    table_count,
)

BATCH_SIZE = 30


def seed_remote_database(replace: bool, metrics_only: bool = False) -> None:
    remote = get_remote_connection()
    try:
        if not METRICS_FILE.is_file():
            raise RuntimeError(
                f"Review metrics not found: {METRICS_FILE}. "
                "Run `python data/etl.py` first."
            )

        if metrics_only:
            create_remote_schema(remote)
            _copy_review_metrics(remote)
            return

        ensure_db()
        local = get_local_connection()
        try:
            _copy_local_orders(local, remote, replace)
        finally:
            local.close()
    finally:
        remote.close()


def _copy_local_orders(
    local: sqlite3.Connection,
    remote: turso_serverless.Connection,
    replace: bool,
) -> None:
    create_remote_schema(remote)
    remote.commit()

    existing_rows = table_count(remote, "orders")
    existing_seed = remote.execute(
        "SELECT value FROM dataset_metadata WHERE key = 'remote_seed_version'"
    ).fetchone()
    if existing_rows and not replace:
        version = existing_seed["value"] if existing_seed else "incomplete"
        raise RuntimeError(
            f"The remote database already contains {existing_rows} orders "
            f"(seed: {version}). Re-run with --replace to overwrite it."
        )

    columns = [
        row["name"] for row in local.execute("PRAGMA table_info(orders)").fetchall()
    ]
    placeholders = ", ".join("?" for _ in columns)
    column_names = ", ".join(columns)
    row_placeholders = f"({placeholders})"
    source = local.execute(f"SELECT {column_names} FROM orders ORDER BY id")

    remote.execute("DELETE FROM orders")
    remote.execute("DELETE FROM dataset_metadata")
    remote.execute(
        """
        INSERT INTO dataset_metadata (key, value)
        VALUES ('remote_seed_version', 'pending')
        """
    )
    remote.commit()

    inserted = 0
    while rows := source.fetchmany(BATCH_SIZE):
        actual_placeholders = ", ".join(row_placeholders for _ in range(len(rows)))
        parameters = tuple(value for row in rows for value in row)
        remote.execute(
            f"INSERT INTO orders ({column_names}) VALUES {actual_placeholders}",
            parameters,
        )
        inserted += len(rows)
        if inserted % 3000 < BATCH_SIZE:
            remote.commit()
            print(f"Pedidos copiados para o banco remoto: {inserted}")

    remote.commit()
    _copy_review_metrics(remote)
    remote.execute(
        """
        INSERT INTO dataset_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        ("remote_seed_version", REMOTE_DATASET_VERSION),
    )
    remote.commit()
    print(f"Carga concluída: {inserted} pedidos e métricas de avaliações.")


def _copy_review_metrics(remote: turso_serverless.Connection) -> None:
    with METRICS_FILE.open("r", encoding="utf-8") as source_file:
        metrics = json.load(source_file)
    remote.execute(
        """
        INSERT INTO dataset_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        ("review_metrics", json.dumps(metrics, ensure_ascii=False)),
    )
    remote.commit()
    print("Métricas de avaliações atualizadas no banco remoto.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Copia os pedidos e métricas locais para um banco Turso remoto."
    )
    seed_mode = parser.add_mutually_exclusive_group()
    seed_mode.add_argument(
        "--replace",
        action="store_true",
        help="apaga os pedidos existentes no banco remoto antes da carga",
    )
    seed_mode.add_argument(
        "--metrics-only",
        action="store_true",
        help="atualiza apenas as métricas, sem modificar os pedidos existentes",
    )
    args = parser.parse_args()
    seed_remote_database(replace=args.replace, metrics_only=args.metrics_only)


if __name__ == "__main__":
    main()
