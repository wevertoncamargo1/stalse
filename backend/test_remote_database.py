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
        main.initialize_ticket_lifecycle(self.connection)
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

    def test_ticket_filters_match_lifecycle_and_missing_priority(self) -> None:
        tickets, total = main.ticket_page(
            self.connection,
            search_term="",
            status=None,
            limit=20,
            offset=0,
            ticket_status="open",
            priority="none",
        )

        self.assertEqual(total, 1)
        self.assertEqual([ticket["id"] for ticket in tickets], [3])

    def test_ticket_lifecycle_is_initialized_once_and_priorities_are_empty(self) -> None:
        lifecycle = {
            row["id"]: (row["status"], row["priority"])
            for row in self.connection.execute(
                "SELECT id, status, priority FROM orders"
            )
        }
        self.assertEqual(lifecycle[1], ("closed", None))
        self.assertEqual(lifecycle[2], ("closed", None))
        self.assertEqual(lifecycle[3], ("open", None))

        self.connection.execute(
            "UPDATE orders SET priority = 'high' WHERE id = 3"
        )
        main.initialize_ticket_lifecycle(self.connection)
        retained = self.connection.execute(
            "SELECT status, priority FROM orders WHERE id = 3"
        ).fetchone()
        self.assertEqual((retained["status"], retained["priority"]), ("open", "high"))

    def test_remote_board_returns_column_totals_and_priority_order(self) -> None:
        with patch.object(main, "get_connection", return_value=self.connection):
            result = main.ticket_board(q="", per_column=1)

        delivered = result["columns"]["delivered"]
        processing = result["columns"]["processing"]
        self.assertEqual(delivered["total"], 2)
        self.assertEqual([ticket["id"] for ticket in delivered["tickets"]], [1])
        self.assertEqual(processing["total"], 1)
        self.assertEqual(result["columns"]["canceled"]["total"], 0)

    def test_remote_board_filters_by_ticket_status_and_priority(self) -> None:
        with patch.object(main, "get_connection", return_value=self.connection):
            result = main.ticket_board(
                q="",
                ticket_status="open",
                priority="none",
                per_column=20,
            )

        self.assertEqual(result["columns"]["processing"]["total"], 1)
        self.assertEqual(result["columns"]["delivered"]["total"], 0)

    def test_priority_high_update_records_operator_and_schedules_webhook(self) -> None:
        background_tasks = main.BackgroundTasks()
        with (
            patch.object(main, "get_connection", return_value=self.connection),
            patch.object(main, "append_activity_file"),
            patch.object(
                main, "insert_activity_row", wraps=main.insert_activity_row
            ) as activity_writer,
        ):
            updated = main.patch_ticket(
                3,
                main.TicketPatch(priority="high"),
                background_tasks,
                operator="Alice",
            )

        self.assertEqual(updated["priority"], "high")
        event = activity_writer.call_args.args[1]
        self.assertEqual(event["actor"], "Alice")
        self.assertEqual(event["event_type"], "ticket_updated")
        self.assertEqual(event["details"]["changes"]["priority"]["to"], "high")
        self.assertEqual(len(background_tasks.tasks), 1)
        self.assertEqual(background_tasks.tasks[0].args[1:], ("Alice", ["priority_high"]))

    def test_delivery_status_closes_ticket_and_schedules_webhook(self) -> None:
        background_tasks = main.BackgroundTasks()
        with (
            patch.object(main, "get_connection", return_value=self.connection),
            patch.object(main, "append_activity_file"),
        ):
            updated = main.patch_ticket(
                3,
                main.TicketPatch(order_status="delivered"),
                background_tasks,
                operator="Alice",
            )

        self.assertEqual((updated["status"], updated["order_status"]), ("closed", "delivered"))
        self.assertEqual(background_tasks.tasks[0].args[2], ["ticket_closed"])

    def test_patch_persists_status_and_priority_across_connections(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "tickets.sqlite"
            setup_connection = sqlite3.connect(database_path)
            setup_connection.row_factory = sqlite3.Row
            main.create_remote_schema(setup_connection)
            setup_connection.execute(
                """
                INSERT INTO orders (
                    id, order_id, customer_id, order_status,
                    order_purchase_timestamp, status
                ) VALUES (1, 'order-1', 'customer-1', 'processing', '2018-01-01', 'open')
                """
            )
            setup_connection.commit()
            setup_connection.close()

            def connect_to_database() -> sqlite3.Connection:
                connection = sqlite3.connect(database_path)
                connection.row_factory = sqlite3.Row
                return connection

            background_tasks = main.BackgroundTasks()
            with (
                patch.object(main, "REMOTE_DATABASE_ENABLED", True),
                patch.object(main, "get_connection", side_effect=connect_to_database),
                patch.object(main, "append_activity_file"),
            ):
                updated = main.patch_ticket(
                    1,
                    main.TicketPatch(order_status="delivered", priority="high"),
                    background_tasks,
                    operator="Alice",
                )

            verification_connection = connect_to_database()
            try:
                persisted = verification_connection.execute(
                    "SELECT order_status, status, priority FROM orders WHERE id = 1"
                ).fetchone()
            finally:
                verification_connection.close()

        self.assertEqual(
            (updated["order_status"], updated["status"], updated["priority"]),
            ("delivered", "closed", "high"),
        )
        self.assertEqual(
            (persisted["order_status"], persisted["status"], persisted["priority"]),
            ("delivered", "closed", "high"),
        )
        self.assertEqual(
            background_tasks.tasks[0].args[2],
            ["ticket_closed", "priority_high"],
        )

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
            with patch.object(main, "get_connection", return_value=connection):
                board = main.ticket_board(q="sao jose", per_column=20)
        finally:
            connection.close()

        self.assertEqual(total, 1)
        self.assertEqual([ticket["id"] for ticket in tickets], [1])
        self.assertEqual(board["columns"]["delivered"]["total"], 1)
        self.assertEqual(
            [ticket["id"] for ticket in board["columns"]["delivered"]["tickets"]],
            [1],
        )

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

    def test_metrics_only_seed_preserves_orders_and_seed_version(self) -> None:
        self.remote.execute(
            """
            INSERT INTO orders (id, order_id, customer_id, order_status, order_purchase_timestamp)
            VALUES (2, 'existing-order', 'customer-2', 'processing', '2018-01-02')
            """
        )
        self.remote.execute(
            """
            INSERT INTO dataset_metadata (key, value)
            VALUES ('remote_seed_version', 'existing-seed')
            """
        )
        self.remote.commit()

        with tempfile.TemporaryDirectory() as temp_dir:
            metrics_file = Path(temp_dir) / "metrics.json"
            metrics_file.write_text(
                json.dumps({"by_day": [{"date": "2018-01-01", "ratings": []}]}),
                encoding="utf-8",
            )
            with patch.object(seed_turso, "METRICS_FILE", metrics_file):
                seed_turso._copy_review_metrics(self.remote)

        orders = self.remote.execute("SELECT order_id FROM orders").fetchall()
        metadata = dict(
            self.remote.execute("SELECT key, value FROM dataset_metadata").fetchall()
        )
        self.assertEqual([order["order_id"] for order in orders], ["existing-order"])
        self.assertEqual(metadata["remote_seed_version"], "existing-seed")
        self.assertEqual(
            json.loads(metadata["review_metrics"]),
            {"by_day": [{"date": "2018-01-01", "ratings": []}]},
        )

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
