from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pytest

from gt_collectors import d1, simhash
from gt_collectors.cli import main
from gt_collectors.review import Candidate
from gt_collectors.signal import Signal
from tests.conftest import FIXTURES, REPO_ROOT, SOURCE_ID, make_signal

# Ankara: inside the Türkiye geofence, so the safety filter drops it (red line, ADR 0013).
ANKARA = (39.93, 32.86)
ATHENS = (37.98, 23.73)


class FakeExecutor:
    """Collects the SQL it is given instead of talking to D1."""

    def __init__(self) -> None:
        self.statements: list[str] = []

    def __call__(self, sql: str) -> None:
        self.statements.append(sql)

    @property
    def sql(self) -> str:
        return "\n".join(self.statements)


class FakeD1:
    """Stands in for `wrangler_executor`, remembering which database each statement went to."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def executor(self, database: str = d1.DATABASE, **_kwargs: object):
        def execute(sql: str) -> None:
            self.calls.append((database, sql))

        return execute

    @property
    def databases(self) -> list[str]:
        return [database for database, _ in self.calls]

    def sql_for(self, database: str) -> str:
        return "\n".join(sql for db, sql in self.calls if db == database)


def make_item(
    n: int = 0,
    *,
    status: str = "queued",
    lat: float | None = None,
    lon: float | None = None,
    text: str | None = None,
    relevance: dict | None = None,
    feed_id: str = "rss-test",
) -> d1.Item:
    signal = make_signal(n, lat=lat, lon=lon, text=text)
    return d1.Item(
        feed_id=feed_id,
        queue_id=signal.content_hash().removeprefix("sha256:")[:12],
        status=status,
        signal=signal,
        redline_check=False,
        relevance=relevance,
    )


RELEVANCE = {
    "score": 0.75,
    "region": "aegean",
    "region_score": 1.0,
    "topic_score": 0.5,
    "topics": ["military-activity"],
    "terms": ["aegean", "exercise"],
    "threshold": 0.5,
    "borderline": False,
}


# --- row mapping ----------------------------------------------------------------------------


def test_row_has_exactly_the_schema_columns() -> None:
    row = d1.row(make_item(1, relevance=RELEVANCE))
    assert tuple(row) == d1.COLUMNS


def test_row_maps_the_signal_fields() -> None:
    item = make_item(2, relevance=RELEVANCE)
    row = d1.row(item)
    signal = item.signal
    assert row["content_hash"] == signal.content_hash()
    assert row["content_hash"].startswith("sha256:") and len(row["content_hash"]) == 71
    assert row["raw_hash"] == signal.raw_hash
    assert row["source_id"] == SOURCE_ID
    assert row["collector_id"] == "rss-test"
    assert row["url"] == signal.url
    assert row["lang"] == "en"
    assert row["title"] == signal.title
    assert row["text"] == signal.text
    assert row["region"] == "aegean"
    assert row["published_at"] == "2026-09-12T10:15:00Z"
    assert row["fetched_at"] == "2026-09-12T10:15:00Z"
    assert row["triage_score"] == 0.75
    labels = json.loads(row["triage_labels"])
    assert labels["feed"] == "rss-test" and labels["queue_id"] == item.queue_id
    assert labels["collector_status"] == "queued" and labels["topics"] == ["military-activity"]


def test_simhash_is_a_signed_64_bit_integer() -> None:
    row = d1.row(make_item(3))
    assert -(2**63) <= row["simhash"] < 2**63
    assert simhash.from_signed64(row["simhash"]) == make_signal(3).simhash()


@pytest.mark.parametrize(
    ("status", "triage"), [("queued", "queued"), ("deferred", "pending"), ("off-topic", "scored")]
)
def test_triage_status_mapping(status: str, triage: str) -> None:
    assert d1.row(make_item(4, status=status))["triage_status"] == triage
    # The collector never writes the two statuses the triage Worker owns.
    assert set(d1.TRIAGE_STATUS.values()).isdisjoint({"dropped", "duplicate"})


def test_unknown_status_is_refused() -> None:
    with pytest.raises(ValueError, match="unknown candidate status"):
        make_item(5, status="published")


def test_geo_json_only_when_there_is_more_than_a_region() -> None:
    assert d1.row(make_item(6))["geo_json"] is None
    row = d1.row(make_item(7, lat=ATHENS[0], lon=ATHENS[1]))
    assert json.loads(row["geo_json"])["lat"] == ATHENS[0]


def test_score_out_of_range_is_refused() -> None:
    with pytest.raises(ValueError, match="triage_score"):
        d1.row(make_item(8, relevance={**RELEVANCE, "score": 1.5}))


def test_candidate_round_trips_through_the_artifact_line() -> None:
    signal = make_signal(9)
    candidate = Candidate(feed_id="rss-test", queue_id="a" * 12, signal=signal, status="off-topic")
    item = d1.Item.from_dict(json.loads(candidate.to_json()))
    assert item.status == "off-topic" and item.signal.to_dict() == signal.to_dict()


# --- SQL ------------------------------------------------------------------------------------


def test_sql_literal_escapes_quotes_and_refuses_junk() -> None:
    assert d1.sql_literal(None) == "NULL"
    assert d1.sql_literal(7) == "7"
    assert d1.sql_literal("it's") == "'it''s'"
    # Backslashes are not escapes in SQLite; the text stays exactly as it was.
    assert d1.sql_literal("a\\'b") == "'a\\''b'"
    with pytest.raises(ValueError, match="NUL"):
        d1.sql_literal("a\x00b")
    with pytest.raises(TypeError):
        d1.sql_literal(True)
    with pytest.raises(TypeError):
        d1.sql_literal({"a": 1})


def test_a_hostile_excerpt_stays_one_literal() -> None:
    hostile = "'); DROP TABLE signals; --"
    sql = d1.insert_sql([d1.row(make_item(10, text=hostile))])
    assert "'''); DROP TABLE signals; --'" in sql  # doubled quote: still one literal
    assert sql.rstrip().endswith("ON CONFLICT(content_hash) DO NOTHING;")


def test_the_generated_sql_runs_against_the_real_schema(tmp_path: Path) -> None:
    """The mapping is checked against db/migrations/signals/0001_init.sql, constraints and all."""
    migration = REPO_ROOT / "db" / "migrations" / "signals" / "0001_init.sql"
    if not migration.exists():  # pragma: no cover - the collectors package can be used alone
        pytest.skip("db/migrations is not part of this checkout")
    hostile = "'); DROP TABLE signals; --"
    items = [
        make_item(60, relevance=RELEVANCE),
        make_item(61, status="deferred", text=hostile),
        make_item(62, status="off-topic", relevance={**RELEVANCE, "score": 0.1, "borderline": False}),
    ]
    with sqlite3.connect(":memory:") as db:
        db.executescript(migration.read_text(encoding="utf-8"))
        executor = FakeExecutor()
        d1.write(items, executor, batch_size=2)
        for statement in executor.statements:
            db.executescript(statement)
        rows = db.execute("SELECT triage_status, text, created_at FROM signals ORDER BY id").fetchall()
        assert [r[0] for r in rows] == ["queued", "pending", "scored"]
        assert rows[1][1] == hostile  # stored as text, no statement of its own
        assert all(r[2].endswith("Z") for r in rows)  # created_at stamped by the database
        # Replaying the same batch: no new row, no changed status, no moved counter.
        before = db.execute("SELECT id, triage_status, created_at FROM signals").fetchall()
        for statement in executor.statements:
            db.executescript(statement)
        assert db.execute("SELECT id, triage_status, created_at FROM signals").fetchall() == before
        assert db.execute("SELECT count(*) FROM signals").fetchone()[0] == 3


def test_insert_is_idempotent_by_content_hash() -> None:
    sql = d1.insert_sql([d1.row(make_item(11))])
    assert sql.startswith(f"INSERT INTO {d1.TABLE} ({', '.join(d1.COLUMNS)})")
    assert sql.rstrip().endswith("ON CONFLICT(content_hash) DO NOTHING;")
    assert "DO UPDATE" not in sql  # never touch a row a human or the triage job may have moved


def test_batching_splits_the_rows() -> None:
    executor = FakeExecutor()
    report = d1.write([make_item(n) for n in range(5)], executor, batch_size=2)
    assert report.rows == 5 and report.batches == 3
    assert len(executor.statements) == 3
    assert [s.count("ON CONFLICT") for s in executor.statements] == [1, 1, 1]
    assert executor.statements[0].count("sha256:") == 4  # 2 rows x (content_hash + raw_hash)
    assert executor.statements[-1].count("sha256:") == 2
    assert report.to_dict()["rows_written_estimate"] == 15  # row + two index entries each


def test_batch_size_is_bounded() -> None:
    with pytest.raises(ValueError, match="batch size"):
        list(d1.iter_batches([1, 2, 3], 0))
    with pytest.raises(ValueError, match="batch size"):
        list(d1.iter_batches([1, 2, 3], d1.BATCH_LIMIT + 1))


def test_empty_batch_writes_nothing() -> None:
    executor = FakeExecutor()
    report = d1.write([], executor)
    assert (report.rows, report.batches) == (0, 0) and executor.statements == []


def test_running_twice_produces_the_same_sql() -> None:
    items = [make_item(n) for n in range(3)]
    first, second = FakeExecutor(), FakeExecutor()
    d1.write(items, first)
    d1.write(items, second)
    assert first.sql == second.sql  # same batch, same statements: a replay inserts nothing new


def test_a_repeated_item_in_one_run_becomes_one_row() -> None:
    executor = FakeExecutor()
    report = d1.write([make_item(12), make_item(12, status="deferred")], executor)
    assert report.rows == 1 and report.duplicates == 1
    assert executor.sql.count("sha256:") == 2


def test_statuses_are_counted() -> None:
    items = [make_item(20), make_item(21, status="deferred"), make_item(22, status="off-topic")]
    report = d1.write(items, FakeExecutor())
    assert report.to_dict()["by_triage_status"] == {"pending": 1, "queued": 1, "scored": 1}


# --- the red line ---------------------------------------------------------------------------


def test_nothing_the_safety_filter_drops_can_reach_the_writer() -> None:
    """A position inside the Türkiye geofence never becomes a row, even if handed to the writer."""
    excerpt = "Ayrintili konum bilgisi"
    inside = make_item(30, lat=ANKARA[0], lon=ANKARA[1], text=excerpt)
    outside = make_item(31, lat=ATHENS[0], lon=ATHENS[1])
    executor = FakeExecutor()
    report = d1.write([inside, outside], executor)
    assert report.dropped_by_filter == 1 and report.rows == 1
    assert excerpt not in executor.sql
    assert inside.signal.url not in executor.sql
    assert inside.signal.content_hash() not in executor.sql
    assert outside.signal.content_hash() in executor.sql


def test_a_half_present_position_is_dropped_too() -> None:
    half = make_item(32, lat=ANKARA[0], lon=None)
    report = d1.write([half], FakeExecutor())
    assert report.dropped_by_filter == 1 and report.rows == 0


def test_prepare_drops_before_it_maps() -> None:
    rows, report = d1.prepare([make_item(33, lat=ANKARA[0], lon=ANKARA[1])])
    assert rows == [] and report.dropped_by_filter == 1


# --- reading a batch and the CLI ------------------------------------------------------------


def _write_batch(path: Path, candidates: list[Candidate]) -> Path:
    path.write_text("".join(f"{c.to_json()}\n" for c in candidates), encoding="utf-8", newline="\n")
    return path


def _candidate(signal: Signal, status: str = "queued") -> Candidate:
    return Candidate(feed_id="rss-test", queue_id="b" * 12, signal=signal, status=status)


def test_read_batch_reads_every_status(tmp_path: Path) -> None:
    file = _write_batch(
        tmp_path / "candidates.jsonl",
        [
            _candidate(make_signal(40)),
            _candidate(make_signal(41), "deferred"),
            _candidate(make_signal(42), "off-topic"),
        ],
    )
    items = d1.read_batch(file)
    assert [i.status for i in items] == ["queued", "deferred", "off-topic"]


def test_read_batch_names_the_bad_line(tmp_path: Path) -> None:
    file = tmp_path / "candidates.jsonl"
    file.write_text('{"nope": 1}\n', encoding="utf-8")
    with pytest.raises(ValueError, match=r"candidates\.jsonl:1"):
        d1.read_batch(file)


def test_cli_dry_run_prints_sql_and_needs_no_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv(d1.TOKEN_ENV, raising=False)
    _write_batch(tmp_path / "candidates.jsonl", [_candidate(make_signal(50))])
    assert main(["--write-d1", str(tmp_path), "--d1-dry-run"]) == 0
    out, err = capsys.readouterr()
    assert "ON CONFLICT(content_hash) DO NOTHING;" in out
    summary = json.loads(err.strip().splitlines()[-1])
    assert summary["rows"] == 1 and summary["batches"] == 1 and summary["dry_run"] is True


def test_cli_without_the_token_says_so_and_leaves_it_to_wrangler(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The workflow skips the step without the secret; locally, `wrangler login` is the other way in."""
    monkeypatch.delenv(d1.TOKEN_ENV, raising=False)
    fake = FakeD1()
    monkeypatch.setattr(d1, "wrangler_executor", fake.executor)
    _write_batch(tmp_path / "candidates.jsonl", [_candidate(make_signal(51))])
    assert main(["--write-d1", str(tmp_path)]) == 0
    err = capsys.readouterr().err
    assert f"note: {d1.TOKEN_ENV} is not set" in err
    assert fake.databases == [d1.DATABASE, d1.OPS_DATABASE]


def test_cli_write_d1_is_its_own_mode(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--write-d1", str(tmp_path), "--dry-run"]) == 2
    assert "its own mode" in capsys.readouterr().err


def test_cli_reports_a_missing_batch(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--write-d1", str(tmp_path / "missing")]) == 2
    assert "d1 error" in capsys.readouterr().err


# --- the review queue (ops.reviews) ----------------------------------------------------------

QUEUE_CONFIG = f"""
feeds:
  - id: rss-queue
    kind: rss
    source_id: {SOURCE_ID}
    url: https://mod.example.org/feed.xml
    cadence_minutes: 30
    lang: en
    regions: [aegean]
    enabled: false
    queue: true
    terms: https://mod.example.org/terms
"""


def _ops_db() -> sqlite3.Connection:
    """In-memory `ops`, built from the real migrations, with one reviewer to decide things."""
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    for path in sorted((REPO_ROOT / "db" / "migrations" / "ops").glob("[0-9][0-9][0-9][0-9]_*.sql")):
        db.executescript(path.read_text(encoding="utf-8"))
    db.execute("INSERT INTO reviewers (id, telegram_user_id, role) VALUES (1, 4242, 'maintainer')")
    return db


def test_only_offered_candidates_become_reviews() -> None:
    rows, _ = d1.prepare(
        [
            make_item(70),
            make_item(71, status="deferred"),
            make_item(72, status="off-topic"),
        ]
    )
    reviews = d1.review_rows(rows)
    assert [r["content_hash"] for r in reviews] == [make_signal(70).content_hash()]


def test_a_review_carries_the_hash_and_nothing_else() -> None:
    rows, _ = d1.prepare([make_item(73)])
    sql = d1.insert_reviews_sql(d1.review_rows(rows))
    assert sql.startswith("INSERT INTO reviews (content_hash)")
    assert sql.rstrip().endswith("ON CONFLICT(content_hash) DO NOTHING;")
    assert "DO UPDATE" not in sql
    # The reviewer and the bot own these; the collector never writes them.
    for column in ("status", "summary_tr", "summary_en", "note", "decided_by", "telegram_message_id"):
        assert column not in sql


def test_nothing_the_safety_filter_drops_can_become_a_review() -> None:
    rows, report = d1.prepare([make_item(74, lat=ANKARA[0], lon=ANKARA[1])])
    assert report.dropped_by_filter == 1
    assert d1.review_rows(rows) == []


def test_reviews_are_written_after_the_signals() -> None:
    """A review whose signal is missing renders as a candidate with no source link."""
    fake = FakeD1()
    rows, _ = d1.prepare([make_item(75)])
    d1.write([make_item(75)], fake.executor(d1.DATABASE))
    d1.write_reviews(rows, fake.executor(d1.OPS_DATABASE))
    assert fake.databases == [d1.DATABASE, d1.OPS_DATABASE]
    assert "INSERT INTO signals" in fake.sql_for(d1.DATABASE)
    assert "INSERT INTO reviews" in fake.sql_for(d1.OPS_DATABASE)


def test_review_rows_batch_like_the_signals() -> None:
    rows, _ = d1.prepare([make_item(n) for n in range(80, 85)])
    executor = FakeExecutor()
    report = d1.write_reviews(rows, executor, batch_size=2)
    assert (report.queued, report.rows, report.batches) == (5, 5, 3)
    assert len(executor.statements) == 3
    assert report.to_dict()["rows_written_estimate"] == 15


def test_promotion_against_the_real_ops_schema() -> None:
    """The SQL runs on the schema the bot reads, and a replay cannot undo a decision."""
    db = _ops_db()
    rows, _ = d1.prepare([make_item(90), make_item(91), make_item(92, status="off-topic")])
    executor = FakeExecutor()
    d1.write_reviews(rows, executor)
    for statement in executor.statements:
        db.executescript(statement)
    queued = db.execute(
        "SELECT content_hash, status, summary_tr, summary_en, decided_by, created_at FROM reviews ORDER BY id"
    ).fetchall()
    assert len(queued) == 2  # the off-topic candidate is not in the bot's queue
    assert all(row[1] == "queued" for row in queued)
    assert all(row[2] is None and row[3] is None and row[4] is None for row in queued)
    assert all(row[5].endswith("Z") for row in queued)

    # A reviewer decides one of them, then the same batch is written again (a re-run).
    db.execute(
        "UPDATE reviews SET status = 'drafted', decided_by = 1, decided_at = ? WHERE content_hash = ?",
        ("2026-09-16T12:00:00Z", make_signal(90).content_hash()),
    )
    before = db.execute("SELECT id, content_hash, status, created_at FROM reviews ORDER BY id").fetchall()
    for statement in executor.statements:
        db.executescript(statement)
    assert (
        db.execute("SELECT id, content_hash, status, created_at FROM reviews ORDER BY id").fetchall()
        == before
    )
    assert db.execute("SELECT count(*) FROM reviews").fetchone()[0] == 2


def test_the_bot_can_read_what_the_promotion_wrote() -> None:
    """The queries in apps/review-bot/src/queue.js, run against a promoted batch."""
    db = _ops_db()
    rows, _ = d1.prepare([make_item(95), make_item(96)])
    d1.write_reviews(rows, db.executescript)
    waiting = db.execute("SELECT COUNT(*) AS n FROM reviews WHERE status = 'queued'").fetchone()[0]
    assert waiting == 2
    listed = db.execute(
        "SELECT id, content_hash, status, summary_tr, summary_en, created_at FROM reviews"
        " WHERE status = 'queued' ORDER BY created_at ASC, id ASC LIMIT 5"
    ).fetchall()
    assert [row[1] for row in listed] == [r["content_hash"] for r in d1.review_rows(rows)]
    # The bot joins to the signal store on exactly this value, and it is the signals key.
    signal_rows, _ = d1.prepare([make_item(95), make_item(96)])
    assert {row[1] for row in listed} == {r["content_hash"] for r in signal_rows}


def test_the_issue_and_the_review_queue_cannot_double_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """One candidate, two surfaces, one identity: the issue's dedup id is the review's hash.

    The GitHub issue and `ops.reviews` are two views of the same queue. The issue shows the first
    12 characters of `content_hash` as the dedup id and `reviews.content_hash` is UNIQUE, so the
    same candidate cannot appear twice in either surface, and neither surface can hold an item the
    other does not. Running the whole thing again adds nothing to either.
    """
    config = tmp_path / "feeds.yaml"
    config.write_text(QUEUE_CONFIG, encoding="utf-8")
    queue = tmp_path / "queue"
    assert (
        main(
            [
                "--config",
                str(config),
                "--feed",
                "rss-queue",
                "--queue-dir",
                str(queue),
                "--input",
                str(FIXTURES / "rss2.xml"),
                "--min-relevance",
                "0",
                "--max-items",
                "2",
            ]
        )
        == 0
    )
    capsys.readouterr()
    issue = (queue / "issue.md").read_text(encoding="utf-8")
    statuses = [
        json.loads(line)["status"]
        for line in (queue / "candidates.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert statuses.count("queued") == 2 and "deferred" in statuses  # the run has all three paths

    fake = FakeD1()
    monkeypatch.setattr(d1, "wrangler_executor", fake.executor)
    assert main(["--write-d1", str(queue)]) == 0
    summary = json.loads(capsys.readouterr().err.strip().splitlines()[-1])

    db = _ops_db()
    for database, sql in fake.calls:
        if database == d1.OPS_DATABASE:
            db.executescript(sql)
    promoted = [hash_ for (hash_,) in db.execute("SELECT content_hash FROM reviews")]
    # Every queued candidate is in both surfaces, exactly once, under the same identity.
    in_issue = set(re.findall(r"`([0-9a-f]{12})`", issue))
    assert in_issue == {h.removeprefix("sha256:")[:12] for h in promoted}
    assert len(promoted) == len(set(promoted)) == summary["reviews"]["rows"] == 2
    assert summary["rows"] == 3  # all three collected items are in the signal store

    # A second run over the same batch: no new row in either surface.
    for database, sql in list(fake.calls):
        if database == d1.OPS_DATABASE:
            db.executescript(sql)
    assert db.execute("SELECT count(*) FROM reviews").fetchone()[0] == 2


def test_cli_can_write_the_store_without_promoting(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    fake = FakeD1()
    monkeypatch.setattr(d1, "wrangler_executor", fake.executor)
    _write_batch(tmp_path / "candidates.jsonl", [_candidate(make_signal(97))])
    assert main(["--write-d1", str(tmp_path), "--no-reviews"]) == 0
    summary = json.loads(capsys.readouterr().err.strip().splitlines()[-1])
    assert fake.databases == [d1.DATABASE] and summary["reviews"] == "skipped"


def test_cli_dry_run_prints_both_statements(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _write_batch(
        tmp_path / "candidates.jsonl",
        [_candidate(make_signal(98)), _candidate(make_signal(99), "off-topic")],
    )
    assert main(["--write-d1", str(tmp_path), "--d1-dry-run"]) == 0
    out, err = capsys.readouterr()
    assert "INSERT INTO signals" in out and "INSERT INTO reviews" in out
    assert out.index("INSERT INTO signals") < out.index("INSERT INTO reviews")
    summary = json.loads(err.strip().splitlines()[-1])
    assert summary["rows"] == 2 and summary["reviews"]["rows"] == 1


# --- the wrangler executor ------------------------------------------------------------------


def test_wrangler_command_is_pinned_and_remote(tmp_path: Path) -> None:
    command = d1.wrangler_command("gt-signals", tmp_path / "batch.sql")
    assert f"wrangler@{d1.WRANGLER_VERSION}" in command
    assert command[-4:-2] == ["--remote", "--yes"]
    assert "d1" in command and "execute" in command and "gt-signals" in command


def test_the_executor_passes_sql_in_a_file_and_never_on_the_command_line() -> None:
    seen: dict[str, object] = {}

    def runner(command: list[str], **kwargs: object) -> object:
        seen["command"] = command
        seen["sql"] = Path(command[-1]).read_text(encoding="utf-8")
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    d1.wrangler_executor("gt-signals", runner=runner)("SELECT 1;")
    assert seen["sql"] == "SELECT 1;"
    assert not any("SELECT 1" in part for part in seen["command"])  # type: ignore[union-attr]


def test_a_failing_wrangler_becomes_a_d1_error() -> None:
    def runner(command: list[str], **kwargs: object) -> object:
        return type("R", (), {"returncode": 1, "stdout": "", "stderr": "boom"})()

    with pytest.raises(d1.D1Error, match="exit 1"):
        d1.wrangler_executor("gt-signals", runner=runner)("SELECT 1;")


def test_has_token_ignores_whitespace() -> None:
    assert d1.has_token({d1.TOKEN_ENV: " "}) is False
    assert d1.has_token({}) is False
    assert d1.has_token({d1.TOKEN_ENV: "x"}) is True
