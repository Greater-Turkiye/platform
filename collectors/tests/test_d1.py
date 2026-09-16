from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from gt_collectors import d1, simhash
from gt_collectors.cli import main
from gt_collectors.review import Candidate
from gt_collectors.signal import Signal
from tests.conftest import REPO_ROOT, SOURCE_ID, make_signal

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
    executor = FakeExecutor()
    monkeypatch.setattr(d1, "wrangler_executor", lambda *a, **k: executor)
    _write_batch(tmp_path / "candidates.jsonl", [_candidate(make_signal(51))])
    assert main(["--write-d1", str(tmp_path)]) == 0
    err = capsys.readouterr().err
    assert f"note: {d1.TOKEN_ENV} is not set" in err
    assert len(executor.statements) == 1


def test_cli_write_d1_is_its_own_mode(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--write-d1", str(tmp_path), "--dry-run"]) == 2
    assert "its own mode" in capsys.readouterr().err


def test_cli_reports_a_missing_batch(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--write-d1", str(tmp_path / "missing")]) == 2
    assert "d1 error" in capsys.readouterr().err


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
