from __future__ import annotations

import json
from pathlib import Path

import pytest

from gt_collectors.cli import _parser, _select, main
from gt_collectors.config import load_feeds
from gt_collectors.signal import SIGNAL_KEYS
from tests.conftest import FIXTURES, SOURCE_ID

CONFIG = f"""
feeds:
  - id: rss-disabled
    kind: rss
    source_id: {SOURCE_ID}
    url: https://mod.example.org/feed.xml
    cadence_minutes: 30
    lang: en
    regions: [aegean]
    enabled: false
  - id: rss-enabled
    kind: rss
    source_id: null
    url: https://mfa.example.org/feed.xml
    cadence_minutes: 30
    lang: en
    enabled: true
"""


@pytest.fixture
def config(tmp_path: Path) -> Path:
    path = tmp_path / "feeds.yaml"
    path.write_text(CONFIG, encoding="utf-8")
    return path


def test_dry_run_prints_contract_json_lines(config: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = main(
        [
            "--config",
            str(config),
            "--feed",
            "rss-disabled",
            "--dry-run",
            "--input",
            str(FIXTURES / "rss2.xml"),
        ]
    )
    out, err = capsys.readouterr()
    assert code == 0
    lines = [json.loads(line) for line in out.splitlines()]
    assert len(lines) == 3
    assert all(tuple(line) == SIGNAL_KEYS for line in lines)
    summary = json.loads(err.strip())
    assert summary["kept"] == 3 and summary["dropped_by_safety_filter"] == 0


def test_disabled_feed_cannot_be_sent(config: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--config", str(config), "--feed", "rss-disabled"]) == 2
    assert "disabled" in capsys.readouterr().err


def test_real_run_needs_secrets(
    config: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("INGEST_URL", raising=False)
    monkeypatch.delenv("INGEST_HMAC_KEY", raising=False)
    assert main(["--config", str(config)]) == 2
    assert "INGEST_HMAC_KEY" in capsys.readouterr().err


def test_input_requires_single_feed_and_dry_run(config: Path) -> None:
    assert main(["--config", str(config), "--dry-run", "--include-disabled", "--input", "x.xml"]) == 2


def test_unknown_feed(config: Path) -> None:
    assert main(["--config", str(config), "--feed", "nope", "--dry-run"]) == 2


def test_fetch_failures_are_reported_without_network(
    config: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # Network is blocked in tests, so the fetch fails; the CLI reports it and exits 1.
    monkeypatch.setattr("time.sleep", lambda _s: None)  # skip retry back-off
    code = main(["--config", str(config), "--feed", "rss-enabled", "--dry-run"])
    summary = json.loads(capsys.readouterr().err.strip())
    assert code == 1 and "error" in summary


def _queue_run(config: Path, out: Path, *extra: str, feed: str = "rss-disabled") -> list[str]:
    """Run the review-queue mode offline, on the RSS fixture."""
    argv = [
        "--config",
        str(config),
        "--feed",
        feed,
        "--queue-dir",
        str(out),
        "--input",
        str(FIXTURES / "rss2.xml"),
        *extra,
    ]
    assert main(argv) == 0
    return sorted(p.name for p in out.iterdir())


def test_queue_mode_writes_batch_issue_and_summary(config: Path, tmp_path: Path) -> None:
    out = tmp_path / "queue"
    assert _queue_run(config, out) == ["candidates.jsonl", "issue-title.txt", "issue.md", "summary.json"]

    candidates = [json.loads(line) for line in (out / "candidates.jsonl").read_text("utf-8").splitlines()]
    assert len(candidates) == 3  # the fixture has 3 usable items
    assert all(tuple(c["signal"]) == SIGNAL_KEYS for c in candidates)
    assert all(len(c["queue_id"]) == 12 for c in candidates)

    body = (out / "issue.md").read_text("utf-8")
    assert "unverified candidates, not published claims" in body
    assert body.count("- [ ] ") == 3
    for candidate in candidates:
        assert candidate["queue_id"] in body

    summary = json.loads((out / "summary.json").read_text("utf-8"))
    assert summary["queued"] == 3 and summary["deferred"] == 0 and summary["errors"] == 0
    # Without --state the ledger is in-memory only: it still dedups within the run, but the next
    # run starts empty.
    assert summary["ledger_before"] == 0 and summary["ledger_after"] == 3


def test_queue_mode_never_sends_and_needs_no_secrets(
    config: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("INGEST_URL", raising=False)
    monkeypatch.delenv("INGEST_HMAC_KEY", raising=False)
    monkeypatch.setattr(
        "gt_collectors.ingest.IngestClient.send",
        lambda *_a, **_k: pytest.fail("queue mode must never send to ingest"),
    )
    _queue_run(config, tmp_path / "queue")


def test_ledger_stops_the_next_run_repeating_the_same_items(config: Path, tmp_path: Path) -> None:
    ledger = tmp_path / "state" / "seen.jsonl"
    first = tmp_path / "first"
    _queue_run(config, first, "--state", str(ledger))
    assert json.loads((first / "summary.json").read_text("utf-8"))["queued"] == 3
    assert ledger.read_text("utf-8").count("\n") == 3

    second = tmp_path / "second"
    _queue_run(config, second, "--state", str(ledger))
    summary = json.loads((second / "summary.json").read_text("utf-8"))
    assert summary["queued"] == 0 and summary["known"] == 3
    assert (second / "candidates.jsonl").read_text("utf-8") == ""
    assert "No new candidates in this run" in (second / "issue.md").read_text("utf-8")
    assert ledger.read_text("utf-8").count("\n") == 3  # unchanged, still small


def test_max_items_defers_the_rest_without_recording_them(config: Path, tmp_path: Path) -> None:
    ledger = tmp_path / "seen.jsonl"
    out = tmp_path / "queue"
    _queue_run(config, out, "--state", str(ledger), "--max-items", "1")
    summary = json.loads((out / "summary.json").read_text("utf-8"))
    assert summary["queued"] == 1 and summary["deferred"] == 2
    assert ledger.read_text("utf-8").count("\n") == 1  # deferred items are not remembered

    # The next run offers the two deferred items again.
    again = tmp_path / "again"
    _queue_run(config, again, "--state", str(ledger), "--max-items", "10")
    assert json.loads((again / "summary.json").read_text("utf-8"))["queued"] == 2


def test_queue_mode_only_runs_feeds_marked_for_the_queue(tmp_path: Path) -> None:
    path = tmp_path / "feeds.yaml"
    path.write_text(
        CONFIG
        + """
  - id: rss-queued
    kind: rss
    source_id: null
    url: https://un.example.org/feed.xml
    cadence_minutes: 120
    lang: en
    enabled: false
    queue: true
    terms: https://un.example.org/copyright
""",
        encoding="utf-8",
    )
    feeds = _select(load_feeds(path), _parser().parse_args(["--queue-dir", str(tmp_path / "q")]))
    assert [f.id for f in feeds] == ["rss-queued"]


def test_queue_and_dry_run_are_different_modes(config: Path, tmp_path: Path) -> None:
    assert main(["--config", str(config), "--queue-dir", str(tmp_path / "q"), "--dry-run"]) == 2


def test_queue_mode_reports_a_broken_ledger(config: Path, tmp_path: Path) -> None:
    ledger = tmp_path / "seen.jsonl"
    ledger.write_text("garbage\n", encoding="utf-8")
    code = main(
        [
            "--config",
            str(config),
            "--feed",
            "rss-disabled",
            "--queue-dir",
            str(tmp_path / "q"),
            "--state",
            str(ledger),
            "--input",
            str(FIXTURES / "rss2.xml"),
        ]
    )
    assert code == 2
