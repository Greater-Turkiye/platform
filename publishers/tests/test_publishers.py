"""Tests for the publishing skeleton.

The most important one is `test_package_has_no_network_client`: the whole point of this package is
that it cannot post, and that stays true only if nobody quietly adds an HTTP client to it.
Run:  cd publishers && python -m pytest tests
"""
from __future__ import annotations

import ast
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from gt_publishers import approval, channels, cli, message

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "bulletin.example.json"
NOW = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
SECRETS = {"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHANNEL_ID": "y",
           "BLUESKY_HANDLE": "z", "BLUESKY_APP_PASSWORD": "w"}


@pytest.fixture
def doc() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


@pytest.fixture
def msg(doc) -> message.Message:
    return message.parse(doc)


# --- the package cannot post

def test_package_has_no_network_client():
    """No module here may import a networking library, and none may hold a real endpoint call."""
    forbidden = {"http", "httpx", "requests", "socket", "urllib", "aiohttp", "ssl", "ftplib",
                 "http.client", "urllib.request", "urllib3"}
    for path in sorted((ROOT / "gt_publishers").glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            bad = [n for n in names if n.split(".")[0] in forbidden or n in forbidden]
            assert not bad, f"{path.name} imports {bad}: this package must stay unable to post"


def test_every_delivery_is_a_refusal(msg):
    for channel in channels.CHANNELS.values():
        result = channels.deliver(channel, msg, SECRETS, approved=True, now=NOW)
        assert not result.action.startswith("posted")
        assert result.action == "blocked:not-implemented"
        assert result.text  # a draft is still produced, for a human to send by hand


def test_channel_noops_when_its_secret_is_absent(msg):
    result = channels.deliver(channels.TELEGRAM, msg, {}, approved=True, now=NOW)
    assert result.action == "skipped:no-secret"
    assert "TELEGRAM_BOT_TOKEN" in result.reason and "TELEGRAM_CHANNEL_ID" in result.reason
    assert channels.TELEGRAM.readiness({})[0] == "inert"
    # the RSS relay needs no credential, so it is never blocked for that reason
    assert channels.RSS_RELAY.missing_secrets({}) == []


def test_no_secret_values_anywhere_in_the_package():
    for path in sorted((ROOT / "gt_publishers").glob("*.py")):
        text = path.read_text(encoding="utf-8")
        for name in ("TELEGRAM_BOT_TOKEN", "BLUESKY_APP_PASSWORD"):
            for line in text.splitlines():
                if name in line:
                    assert "=" not in line.split(name)[1][:3], f"{path.name}: looks like a value for {name}"


# --- the approval gate

def test_approval_needs_reviewer_operator_and_the_exact_phrase(msg):
    with pytest.raises(approval.ApprovalError, match="confirmation phrase"):
        approval.check(msg, "yes", "maintainer", {})
    with pytest.raises(approval.ApprovalError, match="confirmation phrase"):
        approval.check(msg, approval.CONFIRMATION_PHRASE.lower(), "maintainer", {})
    with pytest.raises(approval.ApprovalError, match="operator"):
        approval.check(msg, approval.CONFIRMATION_PHRASE, None, {})
    granted = approval.check(msg, approval.CONFIRMATION_PHRASE, "maintainer", {})
    assert granted.reviewer == "example-reviewer" and granted.operator == "maintainer"


def test_approval_refuses_a_message_without_a_reviewer(doc):
    doc["approved_by"] = "automation"
    parsed = message.parse(doc)
    assert approval.check(parsed, approval.CONFIRMATION_PHRASE, "maintainer", {}).reviewer == "automation"
    doc["approved_by"] = ""
    with pytest.raises(message.MessageError, match="approved_by"):
        message.parse(doc)


def test_kill_switch_beats_everything(msg):
    with pytest.raises(approval.ApprovalError, match="paused"):
        approval.check(msg, approval.CONFIRMATION_PHRASE, "maintainer", {approval.PAUSED_ENV: "1"})


def test_unapproved_delivery_is_blocked_before_anything_else(msg):
    result = channels.deliver(channels.TELEGRAM, msg, SECRETS, approved=False, now=NOW)
    assert result.action == "blocked:not-approved"


# --- the message contract

def test_example_message_is_valid_and_clean(msg):
    assert msg.type == "bulletin" and msg.channels == ("telegram-tr", "bluesky-en")
    assert message.content_findings(msg) == []


@pytest.mark.parametrize("mutate, expected", [
    (lambda d: d.update(type="record"), "record messages need record_id"),
    (lambda d: d.update(record_id="evt_nope"), "not a dataset ID"),
    (lambda d: d.update(type="correction", corrects_publication_id=None), "correction must name"),
    (lambda d: d.update(channels=[]), "channels must be a non-empty list"),
    (lambda d: d.update(channels="telegram-tr"), "channels must be a non-empty list"),
    (lambda d: d.update(idempotency_key=""), "missing required fields"),
    (lambda d: d["sources"][0].pop("archive_url"), "archives are not optional"),
    (lambda d: d.update(sources=[]), "at least one source"),
])
def test_contract_violations_are_rejected(doc, mutate, expected):
    mutate(doc)
    with pytest.raises(message.MessageError, match=expected):
        message.parse(doc)


def test_a_bulletin_must_label_itself_unverified(doc):
    doc["text_en"] = doc["text_en"].replace("[UNVERIFIED] ", "")
    findings = message.content_findings(message.parse(doc))
    assert any("[UNVERIFIED]" in f and "never written as fact" in f for f in findings)


def test_a_bulletin_must_name_its_source(doc):
    doc["text_tr"] = "[DOĞRULANMAMIŞ] Bir şey olmuş."
    assert any("no source is named" in f for f in message.content_findings(message.parse(doc)))


def test_an_undeclared_link_in_the_text_is_a_finding(doc):
    doc["text_en"] += " https://elsewhere.example/story"
    findings = message.content_findings(message.parse(doc))
    assert any("https://elsewhere.example/story" in f and "not a declared source" in f for f in findings)


def test_bulletins_only_come_from_well_rated_sources(doc):
    doc["sources"][0]["rating"] = "D"
    assert any("rated sources" in f for f in message.content_findings(message.parse(doc)))


# --- rate limits and length

def test_rate_limit_counts_the_hour_and_the_utc_day():
    limit = channels.RateLimit(per_hour=4, per_day=30)
    assert limit.exceeded([], NOW) is None
    assert "last hour" in limit.exceeded([NOW - timedelta(minutes=m) for m in (1, 5, 30, 59)], NOW)
    assert limit.exceeded([NOW - timedelta(minutes=m) for m in (61, 120, 180, 240)], NOW) is None
    day = [NOW - timedelta(minutes=70 + i * 3) for i in range(30)]
    assert "today (UTC)" in limit.exceeded(day, NOW)
    assert limit.exceeded([NOW - timedelta(days=1, hours=2)] * 30, NOW) is None  # yesterday does not count


def test_rate_limited_message_is_held_not_dropped(msg):
    recent = [NOW - timedelta(minutes=m) for m in (1, 5, 30, 59)]
    result = channels.deliver(channels.TELEGRAM, msg, SECRETS, approved=True, recent=recent, now=NOW)
    assert result.action == "held:rate-limit" and "limit 4" in result.reason


def test_an_overlong_post_is_blocked_never_truncated(doc):
    doc["text_en"] = "[UNVERIFIED] Example Wire reported " + "x" * 400
    msg = message.parse(doc)
    assert channels.BLUESKY.overlong(msg) and "300" in channels.BLUESKY.overlong(msg)
    result = channels.deliver(channels.BLUESKY, msg, SECRETS, approved=True, now=NOW)
    assert result.action == "blocked:too-long"
    assert doc["text_en"] in result.text  # the draft is intact; a human shortens it


# --- the CLI

def test_cli_check_passes_on_the_example(capsys):
    assert cli.main(["check", "--message", str(EXAMPLE)]) == 0
    assert "0 finding(s)" in capsys.readouterr().out


def test_cli_draft_renders_every_channel(capsys):
    assert cli.main(["draft", "--message", str(EXAMPLE)]) == 0
    out = capsys.readouterr().out
    assert "--- telegram-tr (tr)" in out and "--- bluesky-en (en)" in out
    assert "https://web.archive.org/web/2026/" in out  # Telegram carries the archive link
    assert "cannot post" in out


def test_cli_publish_refuses_and_says_why(capsys, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "x")
    monkeypatch.setenv("TELEGRAM_CHANNEL_ID", "y")
    assert cli.main(["publish", "--message", str(EXAMPLE)]) == 0
    out = capsys.readouterr().out
    assert "refused" in out and "Nothing was posted." in out
    assert "blocked:not-approved" in out


def test_cli_publish_with_full_approval_still_posts_nothing(capsys, monkeypatch):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    assert cli.main(["publish", "--message", str(EXAMPLE),
                     "--confirm", approval.CONFIRMATION_PHRASE, "--operator", "maintainer"]) == 0
    out = capsys.readouterr().out
    assert "human approval: reviewer example-reviewer" in out
    assert out.count("blocked:not-implemented") == 2
    assert "Nothing was posted." in out


def test_cli_channels_lists_secret_names_only(capsys):
    assert cli.main(["channels"]) == 0
    out = capsys.readouterr().out
    for name in ("telegram-tr", "bluesky-en", "feed", "TELEGRAM_BOT_TOKEN", "BLUESKY_APP_PASSWORD"):
        assert name in out
    assert "(names only)" in out
    assert "[manual]" in out and "no free API tier" in out


def test_cli_rejects_an_unknown_channel(doc, tmp_path, capsys):
    doc["channels"] = ["mastodon-en"]
    path = tmp_path / "m.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    assert cli.main(["draft", "--message", str(path)]) == 2
    assert "unknown channel" in capsys.readouterr().err
