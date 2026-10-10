import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import main
import seed_turso


class RemoteDatabaseQueryTests(unittest.TestCase):
    def test_production_frontend_origin_is_allowed(self) -> None:
        self.assertIn("https://stalse-web.vercel.app", main.CORS_ORIGINS)

    def setUp(self) -> None:
        self.connection = sqlite3.connect(":memory:")
        self.connection.row_factory = sqlite3.Row
        main.create_remote_schema(self.connection)
        self.connection.executemany(
            """
            INSERT INTO orders (
                id, order_id, customer_id, order_status,
                order_purchase_timestamp, customer_city_search, priority
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "order-high", "customer-a", "delivered", "2018-01-03", "sao jose", "high"),
                (2, "order-low", "customer-b", "delivered", "2018-01-02", "sao paulo", "low"),
                (3, "order-processing", "customer-c", "processing", "2018-01-01", "campinas", "medium"),
            ],
        )
        self.connection.commit()
        self.remote_setting = main.REMOTE_DATABASE_ENABLED
        main.REMOTE_DATABASE_ENABLED = True

    def tearDown(self) -> None:
        main.REMOTE_DATABASE_ENABLED = self.remote_setting
        self.connection.close()

    def test_remote_search_matches_normalized_city(self) -> None:
        tickets, total = main.ticket_page(
            self.connection,
            search_term="são josé",
            status=None,
            limit=20,
            offset=0,
        )

        self.assertEqual(total, 1)
        self.assertEqual([ticket["id"] for ticket in tickets], [1])

    def test_remote_search_matches_order_fields(self) -> None:
        tickets, total = main.ticket_page(
            self.connection,
            search_term="processing",
            status=None,
            limit=20,
            offset=0,
        )

        self.assertEqual(total, 1)
        self.assertEqual([ticket["id"] for ticket in tickets], [3])

    def test_remote_board_returns_column_totals_and_priority_order(self) -> None:
        with patch.object(main, "get_connection", return_value=self.connection):
            result = main.ticket_board(q="", per_column=1)

        delivered = result["columns"]["delivered"]
        processing = result["columns"]["processing"]
        self.assertEqual(delivered["total"], 2)
        self.assertEqual([ticket["id"] for ticket in delivered["tickets"]], [1])
        self.assertEqual(processing["total"], 1)
        self.assertEqual(result["columns"]["canceled"]["total"], 0)

    def test_local_search_keeps_using_fts5(self) -> None:
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.create_function("normalize_text", 1, main.normalize_text)
        main.create_schema(connection)
        connection.execute(
            """
            INSERT INTO orders (
                id, order_id, customer_id, order_status,
                order_purchase_timestamp, customer_city
            )
            VALUES (1, 'order-city', 'customer-city', 'delivered', '2018-01-01', 'São José')
            """
        )
        main.rebuild_order_fts(connection)
        main.REMOTE_DATABASE_ENABLED = False

        try:
            tickets, total = main.ticket_page(
                connection,
                search_term="sao jose",
                status=None,
                limit=20,
                offset=0,
            )
        finally:
            connection.close()

        self.assertEqual(total, 1)
        self.assertEqual([ticket["id"] for ticket in tickets], [1])

    def test_startup_uses_only_the_remote_database_when_configured(self) -> None:
        with (
            patch.object(main, "REMOTE_DATABASE_ENABLED", True),
            patch.object(main, "ensure_remote_db") as remote_check,
            patch.object(main, "ensure_db") as local_setup,
        ):
            main.startup_event()

        remote_check.assert_called_once_with()
        local_setup.assert_not_called()

    def test_startup_keeps_local_sqlite_when_remote_is_not_configured(self) -> None:
        with (
            patch.object(main, "REMOTE_DATABASE_ENABLED", False),
            patch.object(main, "ensure_remote_db") as remote_check,
            patch.object(main, "ensure_db") as local_setup,
        ):
            main.startup_event()

        local_setup.assert_called_once_with()
        remote_check.assert_not_called()


class RemoteDatabaseSeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.local = sqlite3.connect(":memory:")
        self.local.row_factory = sqlite3.Row
        main.create_remote_schema(self.local)
        self.local.execute(
            """
            INSERT INTO orders (id, order_id, customer_id, order_status, order_purchase_timestamp)
            VALUES (1, 'order-1', 'customer-1', 'delivered', '2018-01-01')
            """
        )
        self.local.commit()

        self.remote = sqlite3.connect(":memory:")
        self.remote.row_factory = sqlite3.Row
        main.create_remote_schema(self.remote)

    def tearDown(self) -> None:
        self.local.close()
        self.remote.close()

    def test_seed_copies_orders_and_review_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            metrics_file = Path(temp_dir) / "metrics.json"
            metrics_file.write_text(json.dumps({"reviews": []}), encoding="utf-8")
            with patch.object(seed_turso, "METRICS_FILE", metrics_file):
                seed_turso._copy_local_orders(self.local, self.remote, replace=False)

        order = self.remote.execute("SELECT order_id FROM orders").fetchone()
        metrics = self.remote.execute(
            "SELECT value FROM dataset_metadata WHERE key = 'review_metrics'"
        ).fetchone()
        self.assertEqual(order["order_id"], "order-1")
        self.assertEqual(json.loads(metrics["value"]), {"reviews": []})

    def test_seed_refuses_to_overwrite_existing_orders_without_replace(self) -> None:
        self.remote.execute(
            """
            INSERT INTO orders (id, order_id, customer_id, order_status, order_purchase_timestamp)
            VALUES (2, 'existing-order', 'customer-2', 'processing', '2018-01-02')
            """
        )
        self.remote.commit()

        with self.assertRaisesRegex(RuntimeError, "Re-run with --replace"):
            seed_turso._copy_local_orders(self.local, self.remote, replace=False)

        order = self.remote.execute("SELECT order_id FROM orders").fetchone()
        self.assertEqual(order["order_id"], "existing-order")

if __name__ == "__main__":
    unittest.main()
