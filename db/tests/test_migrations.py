"""Apply the D1 migrations to in-memory SQLite and check constraints and indexes.

Standard library only:  python -m unittest discover -s db/tests -v
"""

from __future__ import annotations

import re
import sqlite3
import unittest
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
H1 = "sha256:" + "a" * 64
H2 = "sha256:" + "b" * 64
TS = "2026-09-12T10:15:00Z"
# Wildcards and character classes allowed in one LIKE/GLOB pattern on D1 (measured remotely).
D1_PATTERN_LIMIT = 10


def apply(database: str) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")  # D1 enforces foreign keys by default
    files = sorted((MIGRATIONS / database).glob("[0-9][0-9][0-9][0-9]_*.sql"))
    assert files, f"no migrations for {database}"
    for path in files:
        conn.executescript(path.read_text(encoding="utf-8"))
    return conn


def user_indexes(conn: sqlite3.Connection) -> dict[str, list[str]]:
    """Explicit indexes and implicit UNIQUE/PK autoindexes, per table."""
    out: dict[str, list[str]] = {}
    for (table,) in conn.execute("SELECT name FROM sqlite_schema WHERE type = 'table'"):
        out[table] = sorted(row[1] for row in conn.execute(f"PRAGMA index_list('{table}')"))
    return out


class MigrationFiles(unittest.TestCase):
    def test_naming_and_no_transactions(self) -> None:
        for db in ("ops", "signals"):
            files = sorted((MIGRATIONS / db).glob("*.sql"))
            self.assertEqual(files[0].name, "0001_init.sql")
            for path in files:
                self.assertRegex(path.name, r"^\d{4}_[a-z0-9_]+\.sql$")
                sql = path.read_text(encoding="utf-8").upper()
                # D1 applies each migration file itself; explicit transactions/PRAGMAs are not allowed.
                self.assertNotIn("BEGIN TRANSACTION", sql)
                self.assertNotIn("PRAGMA", sql)

    def test_signals_glob_patterns_are_simple_enough_for_d1(self) -> None:
        """D1 refuses a LIKE/GLOB pattern with more than ten wildcards or character classes.

        Local SQLite evaluates such a pattern happily, so only the remote database says
        ``LIKE or GLOB pattern too complex: SQLITE_ERROR [code: 7500]`` — and it says it on every
        INSERT, not on CREATE TABLE. The one-line timestamp check of `signals` 0001 hit exactly
        that and was rewritten in 0002. The `ops` tables still carry the long pattern in their own
        timestamp checks; they need the same rebuild before anything writes to them, which is why
        this test names the database it covers.
        """
        conn = apply("signals")
        self.addCleanup(conn.close)
        schema = "\n".join(
            sql for (sql,) in conn.execute("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL")
        )
        for pattern in re.findall(r"(?:GLOB|LIKE)\s+'([^']*)'", schema):
            with self.subTest(pattern=pattern):
                self.assertLessEqual(len(re.findall(r"\[[^\]]*\]|[*?]", pattern)), D1_PATTERN_LIMIT)

    def test_all_tables_are_strict(self) -> None:
        for db in ("ops", "signals"):
            conn = apply(db)
            self.addCleanup(conn.close)
            rows = conn.execute("SELECT name, strict FROM pragma_table_list WHERE schema = 'main'").fetchall()
            tables = {name: strict for name, strict in rows if not name.startswith("sqlite_")}
            self.assertTrue(tables)
            self.assertTrue(all(tables.values()), tables)


class Signals(unittest.TestCase):
    def setUp(self) -> None:
        self.db = apply("signals")
        self.addCleanup(self.db.close)

    def insert(self, **overrides: object) -> None:
        row = {
            "content_hash": H1,
            "collector_id": "rss-test",
            "url": "https://example.org/a",
            "fetched_at": TS,
            "geo_json": '{"region":"aegean"}',
        }
        row.update(overrides)
        cols = ", ".join(row)
        marks = ", ".join("?" for _ in row)
        self.db.execute(f"INSERT INTO signals ({cols}) VALUES ({marks})", tuple(row.values()))

    def test_defaults(self) -> None:
        self.insert()
        status, created = self.db.execute("SELECT triage_status, created_at FROM signals").fetchone()
        self.assertEqual(status, "pending")
        self.assertRegex(created, r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")

    def test_content_hash_is_unique_and_upsert_is_idempotent(self) -> None:
        self.insert()
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert(url="https://example.org/other")
        cur = self.db.execute(
            "INSERT INTO signals (content_hash, collector_id, url, fetched_at) VALUES (?, 'rss-test', ?, ?) "
            "ON CONFLICT (content_hash) DO NOTHING",
            (H1, "https://example.org/a", TS),
        )
        self.assertEqual(cur.rowcount, 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM signals").fetchone()[0], 1)

    def test_constraints(self) -> None:
        bad = [
            {"content_hash": "sha256:short"},
            {"content_hash": "sha256:" + "G" * 64},
            {"url": "ftp://example.org/a"},
            {"url": "javascript:alert(1)"},
            {"fetched_at": "2026-09-12 10:15:00"},
            {"fetched_at": "2026-09-12T10:15:00+03:00"},
            {"published_at": "yesterday"},
            {"triage_status": "published"},
            {"triage_score": 1.5},
            {"text": "x" * 1001},
            {"title": "x" * 301},
            {"geo_json": "{not json"},
            {"triage_labels": "[1,"},
            {"source_id": "src_short"},
            {"collector_id": None},
            {"simhash": "not-an-int"},  # STRICT typing
        ]
        for i, change in enumerate(bad):
            with self.subTest(change=change), self.assertRaises(sqlite3.IntegrityError):
                self.insert(content_hash=change.pop("content_hash", f"sha256:{i:064x}"), **change)

    def test_signed_simhash_round_trips(self) -> None:
        self.insert(simhash=-(2**63))
        self.insert(content_hash=H2, simhash=2**63 - 1)
        values = sorted(v for (v,) in self.db.execute("SELECT simhash FROM signals"))
        self.assertEqual(values, [-(2**63), 2**63 - 1])

    def test_only_budgeted_indexes_exist(self) -> None:
        # Index writes count against the 100k rows/day D1 limit; adding one must be deliberate.
        self.assertEqual(
            user_indexes(self.db)["signals"],
            ["signals_triage_created", "sqlite_autoindex_signals_1"],
        )

    def test_triage_and_retention_queries_use_the_index(self) -> None:
        for sql in (
            "SELECT id FROM signals WHERE triage_status = 'pending' ORDER BY created_at LIMIT 50",
            "SELECT id FROM signals WHERE triage_status IN "
            "('pending','scored','duplicate','dropped','queued') AND created_at < '2026-06-14T00:00:00Z' LIMIT 500",
        ):
            plan = " ".join(row[-1] for row in self.db.execute(f"EXPLAIN QUERY PLAN {sql}"))
            self.assertIn("signals_triage_created", plan, sql)
            self.assertNotIn("USE TEMP B-TREE", plan, sql)

    def test_batched_retention_delete(self) -> None:
        for i in range(5):
            day = "2026-06-01T00:00:00Z" if i < 3 else TS
            self.insert(content_hash=f"sha256:{i:064x}", created_at=day)
        self.db.execute(
            "DELETE FROM signals WHERE id IN (SELECT id FROM signals WHERE triage_status IN "
            "('pending','scored','duplicate','dropped','queued') AND created_at < ? LIMIT 2)",
            ("2026-06-14T00:00:00Z",),
        )
        self.assertEqual(self.db.execute("SELECT count(*) FROM signals").fetchone()[0], 3)


class Ops(unittest.TestCase):
    def setUp(self) -> None:
        self.db = apply("ops")
        self.addCleanup(self.db.close)
        self.db.execute("INSERT INTO reviewers (id, github_login, telegram_user_id, role) VALUES (1, 'rev-a', 1001, 'maintainer')")

    def test_expected_tables(self) -> None:
        tables = {n for (n,) in self.db.execute("SELECT name FROM sqlite_schema WHERE type = 'table'")}
        self.assertEqual(
            tables, {"reviewers", "reviews", "drafts", "publications", "usage_ledger", "collector_state"}
        )

    def test_reviewers(self) -> None:
        with self.assertRaises(sqlite3.IntegrityError):  # duplicate telegram id
            self.db.execute("INSERT INTO reviewers (telegram_user_id) VALUES (1001)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO reviewers (telegram_user_id, role) VALUES (1002, 'admin')")
        with self.assertRaises(sqlite3.IntegrityError):  # unknown added_by
            self.db.execute("INSERT INTO reviewers (telegram_user_id, added_by) VALUES (1003, 99)")
        columns = {row[1] for row in self.db.execute("PRAGMA table_info('reviewers')")}
        self.assertFalse(columns & {"name", "email", "phone", "real_name"})

    def test_reviews(self) -> None:
        self.db.execute("INSERT INTO reviews (content_hash) VALUES (?)", (H1,))
        with self.assertRaises(sqlite3.IntegrityError):  # one review per signal
            self.db.execute("INSERT INTO reviews (content_hash) VALUES (?)", (H1,))
        with self.assertRaises(sqlite3.IntegrityError):  # decisions need who + when
            self.db.execute("UPDATE reviews SET status = 'dismissed' WHERE content_hash = ?", (H1,))
        self.db.execute(
            "UPDATE reviews SET status = 'dismissed', decided_by = 1, decided_at = ? WHERE content_hash = ?", (TS, H1)
        )
        with self.assertRaises(sqlite3.IntegrityError):  # unknown reviewer
            self.db.execute("INSERT INTO reviews (content_hash, status, decided_by, decided_at) VALUES (?, 'drafted', 42, ?)", (H2, TS))

    def test_drafts(self) -> None:
        self.db.execute("INSERT INTO reviews (id, content_hash) VALUES (1, ?)", (H1,))
        self.db.execute(
            "INSERT INTO drafts (review_id, kind, record_id, pr_number, promoted_by) VALUES (1, 'event', ?, 7, 1)",
            ("evt_01j8x3k5r2m9q7t4v6w8y0z2ab",),
        )
        with self.assertRaises(sqlite3.IntegrityError):  # PR number unique
            self.db.execute("INSERT INTO drafts (review_id, kind, pr_number, promoted_by) VALUES (1, 'event', 7, 1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO drafts (review_id, kind, promoted_by) VALUES (1, 'rumour', 1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO drafts (review_id, kind, record_id, promoted_by) VALUES (1, 'event', 'xyz_1', 1)")

    def publish(self, **overrides: object) -> int:
        row = {
            "type": "bulletin",
            "channel": "telegram-tr",
            "lang": "tr",
            "text": "[DOĞRULANMAMIŞ] …",
            "idempotency_key": "msg-0001",
            "approved_by": "rev-a",
        }
        row.update(overrides)
        cols, marks = ", ".join(row), ", ".join("?" for _ in row)
        return self.db.execute(f"INSERT INTO publications ({cols}) VALUES ({marks})", tuple(row.values())).lastrowid

    def test_publications_idempotency_per_channel(self) -> None:
        self.publish()
        self.publish(channel="bluesky-en", lang="en")  # same message, other channel
        with self.assertRaises(sqlite3.IntegrityError):
            self.publish()  # replay on the same channel

    def test_publication_rules(self) -> None:
        first = self.publish()
        bad = [
            {"type": "record"},  # record without record_id
            {"type": "correction"},  # correction without original
            {"status": "posted"},  # posted without posted_at
            {"lang": "de"},
            {"channel": "Telegram TR"},
            {"idempotency_key": "short"},
            {"external_url": "http://t.me/x"},
            {"corrects_publication_id": 999, "type": "correction"},
        ]
        for i, change in enumerate(bad):
            with self.subTest(change=change), self.assertRaises(sqlite3.IntegrityError):
                self.publish(**{"idempotency_key": f"msg-bad-{i:04d}", **change})
        self.publish(type="correction", corrects_publication_id=first, idempotency_key="msg-0002")
        self.publish(type="record", record_id="evt_01j8x3k5r2m9q7t4v6w8y0z2ab", idempotency_key="msg-0003")
        self.publish(status="posted", posted_at=TS, idempotency_key="msg-0004")

    def test_rate_limit_query_uses_index(self) -> None:
        sql = (
            "SELECT count(*) FROM publications WHERE channel = 'telegram-tr' "
            "AND posted_at >= '2026-09-12T09:15:00Z'"
        )
        plan = " ".join(row[-1] for row in self.db.execute(f"EXPLAIN QUERY PLAN {sql}"))
        self.assertIn("publications_channel_posted", plan)

    def test_usage_ledger_upsert(self) -> None:
        upsert = (
            "INSERT INTO usage_ledger (day, service, units, daily_limit) VALUES ('2026-09-12', 'd1-writes', ?, 100000) "
            "ON CONFLICT (day, service) DO UPDATE SET units = units + excluded.units, updated_at = excluded.updated_at"
        )
        self.db.execute(upsert, (40,))
        self.db.execute(upsert, (2,))
        self.assertEqual(self.db.execute("SELECT units FROM usage_ledger").fetchone()[0], 42)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO usage_ledger (day, service, units) VALUES ('12.09.2026', 'queues', 1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO usage_ledger (day, service, units) VALUES ('2026-09-12', 'queues', -1)")

    def test_collector_state(self) -> None:
        self.db.execute("INSERT INTO collector_state (collector_id, enabled) VALUES ('rss-aze-mod', 1)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO collector_state (collector_id) VALUES ('rss-aze-mod')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO collector_state (collector_id, enabled) VALUES ('rss-x-y', 2)")

    def test_hot_tables_have_no_extra_index(self) -> None:
        # WITHOUT ROWID: the primary key is the table, so an upsert is one row write.
        indexes = user_indexes(self.db)
        self.assertEqual(indexes["usage_ledger"], ["sqlite_autoindex_usage_ledger_1"])
        self.assertEqual(indexes["collector_state"], ["sqlite_autoindex_collector_state_1"])
        for table in ("usage_ledger", "collector_state"):
            sql = self.db.execute("SELECT sql FROM sqlite_schema WHERE name = ?", (table,)).fetchone()[0]
            self.assertIn("WITHOUT ROWID", sql)


if __name__ == "__main__":
    unittest.main()
