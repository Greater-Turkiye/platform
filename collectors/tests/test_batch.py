"""The batch the run publishes for the ingest Worker (``gt_collectors.batch``).

The red-line test in here is :func:`test_a_dropped_record_never_reaches_the_published_file`: a
signal inside the Türkiye geofence must not appear in a file that is pushed to a public branch,
whatever the caller does.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from gt_collectors import batch, d1, simhash
from gt_collectors.cli import main
from tests.conftest import SOURCE_ID
from tests.test_d1 import ANKARA, RELEVANCE, make_item

NOW = datetime(2026, 9, 16, 5, 23, 11, tzinfo=UTC)
RUN_URL = "https://github.com/Greater-Turkiye/platform/actions/runs/18234567890"


def publish(items, tmp_path: Path, **kwargs):
    return batch.publish(
        items,
        directory=tmp_path / "batches",
        identifier=kwargs.pop("identifier", "2026-09-16-18234567890"),
        created_at=kwargs.pop("created_at", NOW),
        **kwargs,
    )


def read(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


# --- the batch id and its file name ---------------------------------------------------------


def test_run_id_is_reduced_to_safe_characters() -> None:
    assert batch.run_id("18234567890", now=NOW) == "18234567890"
    assert batch.run_id("../../etc/passwd", now=NOW) == "etcpasswd"
    assert batch.run_id("A-B_C", now=NOW) == "abc"
    assert batch.run_id("x" * 80, now=NOW) == "x" * 32


def test_run_id_falls_back_to_the_run_time() -> None:
    assert batch.run_id(None, now=NOW) == "052311"
    assert batch.run_id("///", now=NOW) == "052311"


def test_batch_id_is_the_day_and_the_run() -> None:
    assert batch.batch_id(date(2026, 9, 16), "18234567890") == "2026-09-16-18234567890"
    assert batch.file_name("2026-09-16-18234567890") == "2026-09-16-18234567890.json"


@pytest.mark.parametrize("bad", ["", "2026-09-16", "2026-09-16-", "16-09-2026-1", "2026-09-16-a/b", "../x"])
def test_a_file_name_is_refused_unless_it_is_a_batch_id(bad: str) -> None:
    with pytest.raises(batch.BatchError):
        batch.file_name(bad)


# --- the published rows ---------------------------------------------------------------------


def test_a_published_row_is_exactly_a_signals_row(tmp_path: Path) -> None:
    summary = publish([make_item(1, relevance=RELEVANCE)], tmp_path)
    row = read(summary["file"])["rows"][0]

    assert set(row) == set(d1.COLUMNS)
    assert row["content_hash"].startswith("sha256:") and len(row["content_hash"]) == 71
    assert row["collector_id"] == "rss-test"
    assert row["source_id"] == SOURCE_ID
    assert row["triage_status"] == "queued"
    assert row["triage_score"] == RELEVANCE["score"]
    assert json.loads(row["triage_labels"])["feed"] == "rss-test"


def test_simhash_travels_as_hex_because_json_numbers_cannot_hold_64_bits(tmp_path: Path) -> None:
    item = make_item(2, relevance=RELEVANCE)
    summary = publish([item], tmp_path)
    row = read(summary["file"])["rows"][0]

    assert isinstance(row["simhash"], str)
    assert len(row["simhash"]) == 16
    # The same value the push writer stores as a signed 64-bit integer.
    assert simhash.to_signed64(int(row["simhash"], 16)) == d1.row(item)["simhash"]


def test_the_published_rows_carry_nothing_the_signals_table_does_not(tmp_path: Path) -> None:
    summary = publish([make_item(3, relevance=RELEVANCE)], tmp_path)
    row = read(summary["file"])["rows"][0]

    # The candidate's own extras (archive_url, the full relevance record) stay in the artifact.
    assert "archive_url" not in row
    assert "relevance" not in row
    assert "signal" not in row


# --- the red line ---------------------------------------------------------------------------


def test_a_dropped_record_never_reaches_the_published_file(tmp_path: Path) -> None:
    inside = make_item(4, lat=ANKARA[0], lon=ANKARA[1])
    outside = make_item(5, relevance=RELEVANCE)

    summary = publish([inside, outside], tmp_path)
    payload = read(summary["file"])

    assert summary["dropped_by_safety_filter"] == 1
    assert [r["content_hash"] for r in payload["rows"]] == [outside.signal.content_hash()]
    # Not even the url of a dropped item is anywhere in the published bytes.
    assert inside.signal.url not in Path(summary["file"]).read_text(encoding="utf-8")


# --- the pointer ----------------------------------------------------------------------------


def test_the_pointer_names_the_batch_and_its_digest(tmp_path: Path) -> None:
    summary = publish([make_item(6, relevance=RELEVANCE)], tmp_path)
    head = read(summary["pointer"])
    body = Path(summary["file"]).read_bytes()

    assert head["schema"] == batch.POINTER_SCHEMA
    assert head["batch_id"] == "2026-09-16-18234567890"
    assert head["file"] == "2026-09-16-18234567890.json"
    assert head["sha256"] == hashlib.sha256(body).hexdigest()
    assert head["rows"] == 1
    assert Path(summary["pointer"]).name == batch.POINTER_FILE


def test_the_document_carries_counts_and_the_run_link(tmp_path: Path) -> None:
    items = [
        make_item(7, status="queued", relevance=RELEVANCE),
        make_item(8, status="deferred", relevance=RELEVANCE),
        make_item(9, status="off-topic", relevance=RELEVANCE),
    ]
    summary = publish(items, tmp_path, run_url=RUN_URL)
    payload = read(summary["file"])

    assert payload["schema"] == batch.SCHEMA
    assert payload["created_at"] == "2026-09-16T05:23:11Z"
    assert payload["run_url"] == RUN_URL
    assert payload["counts"]["rows"] == 3
    assert payload["counts"]["reviews"] == 1  # only `queued` becomes a review row
    assert payload["counts"]["by_triage_status"] == {"pending": 1, "queued": 1, "scored": 1}


def test_a_run_url_that_is_not_https_is_refused(tmp_path: Path) -> None:
    with pytest.raises(batch.BatchError):
        publish([make_item(10, relevance=RELEVANCE)], tmp_path, run_url="javascript:alert(1)")


# --- the row cap ----------------------------------------------------------------------------


def test_over_the_cap_the_queued_candidates_are_the_ones_that_are_kept(tmp_path: Path) -> None:
    items = [make_item(n, status="off-topic", relevance=RELEVANCE) for n in range(100, 105)]
    items.append(make_item(200, status="queued", relevance=RELEVANCE))

    summary = publish(items, tmp_path, limit=2)
    payload = read(summary["file"])

    assert payload["counts"]["rows"] == 2
    assert payload["counts"]["truncated"] == 4
    assert payload["rows"][0]["triage_status"] == "queued"


def test_the_cap_is_what_the_worker_accepts() -> None:
    assert batch.MAX_ROWS == 1000


# --- pruning --------------------------------------------------------------------------------


def names(days: list[str]) -> list[str]:
    return [f"{day}-{i}.json" for i, day in enumerate(days)]


def test_nothing_is_pruned_while_the_branch_is_small() -> None:
    existing = names(["2026-09-14", "2026-09-15"])
    assert batch.prune_plan(existing, keep="2026-09-16-x.json", today=date(2026, 9, 16)) == []


def test_batches_older_than_the_retention_window_are_dropped() -> None:
    old, recent = "2026-08-20-1.json", "2026-09-15-2.json"
    plan = batch.prune_plan([old, recent], keep="2026-09-16-x.json", today=date(2026, 9, 16))
    assert plan == [old]


def test_the_oldest_go_once_there_are_too_many() -> None:
    existing = names([f"2026-09-{day:02d}" for day in range(1, 17)])
    plan = batch.prune_plan(
        existing, keep="2026-09-16-x.json", today=date(2026, 9, 16), retention_days=3650, max_batches=5
    )
    assert plan == sorted(existing)[:12]  # 16 kept + the new one, minus the 5 allowed


def test_the_pointer_and_anything_unrecognised_are_left_alone() -> None:
    existing = ["latest.json", "seen.jsonl", "README.md", "2026-01-01-1.json"]
    plan = batch.prune_plan(existing, keep="2026-09-16-x.json", today=date(2026, 9, 16))
    assert plan == ["2026-01-01-1.json"]


def test_the_batch_written_by_this_run_is_never_pruned() -> None:
    keep = "2026-09-16-x.json"
    plan = batch.prune_plan([keep], keep=keep, today=date(2026, 9, 16), max_batches=1)
    assert plan == []


def test_publish_reports_the_prune_list_with_its_directory(tmp_path: Path) -> None:
    (tmp_path / "batches").mkdir()
    summary = publish(
        [make_item(11, relevance=RELEVANCE)],
        tmp_path,
        existing=["2026-01-01-old.json", "latest.json"],
    )
    assert summary["prune"] == [(tmp_path / "batches" / "2026-01-01-old.json").as_posix()]


# --- the command line -----------------------------------------------------------------------


def write_queue(tmp_path: Path, items) -> Path:
    queue = tmp_path / "queue"
    queue.mkdir()
    lines = [json.dumps(_candidate_line(item), ensure_ascii=False) for item in items]
    (queue / "candidates.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    return queue


def _candidate_line(item: d1.Item) -> dict:
    return {
        "queue_id": item.queue_id,
        "feed": item.feed_id,
        "status": {"queued": "queued", "pending": "deferred", "scored": "off-topic"}.get(
            item.status, item.status
        ),
        "archive_url": None,
        "redline_check": item.redline_check,
        "relevance": item.relevance,
        "signal": item.signal.to_dict(),
    }


def test_the_cli_publishes_a_batch_a_pointer_and_a_summary(tmp_path: Path, capsys) -> None:
    queue = write_queue(tmp_path, [make_item(12, relevance=RELEVANCE)])
    out = tmp_path / "batches"

    code = main(
        [
            "--publish-batch",
            str(queue),
            "--batch-dir",
            str(out),
            "--run-id",
            "18234567890",
            "--run-url",
            RUN_URL,
        ]
    )

    assert code == 0
    summary = json.loads((queue / "publish.json").read_text(encoding="utf-8"))
    assert summary["rows"] == 1
    assert summary["reviews"] == 1
    assert Path(summary["file"]).exists()
    assert Path(summary["pointer"]).exists()
    assert summary["prune"] == []
    assert read(summary["pointer"])["batch_id"].endswith("-18234567890")


def test_the_cli_reads_the_existing_names_as_git_prints_them(tmp_path: Path) -> None:
    queue = write_queue(tmp_path, [make_item(13, relevance=RELEVANCE)])
    listing = tmp_path / "existing.txt"
    listing.write_text("2026-01-01-old.json\nlatest.json\n", encoding="utf-8")

    code = main(
        [
            "--publish-batch",
            str(queue),
            "--batch-dir",
            str(tmp_path / "batches"),
            "--run-id",
            "1",
            "--existing",
            str(listing),
        ]
    )

    assert code == 0
    summary = json.loads((queue / "publish.json").read_text(encoding="utf-8"))
    assert [Path(p).name for p in summary["prune"]] == ["2026-01-01-old.json"]


def test_publishing_needs_no_credential(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    queue = write_queue(tmp_path, [make_item(14, relevance=RELEVANCE)])

    assert main(["--publish-batch", str(queue), "--batch-dir", str(tmp_path / "b"), "--run-id", "1"]) == 0


def test_push_and_publish_are_different_modes(tmp_path: Path) -> None:
    queue = write_queue(tmp_path, [make_item(15, relevance=RELEVANCE)])
    assert main(["--publish-batch", str(queue), "--write-d1", str(queue)]) == 2
