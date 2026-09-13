from __future__ import annotations

import json
from pathlib import Path

import pytest

from gt_collectors.cli import main
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
