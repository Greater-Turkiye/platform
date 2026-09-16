from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

import pytest

from gt_collectors import fetch, review
from gt_collectors.normalize import normalize_url, sha256_prefixed
from gt_collectors.review import Candidate, archive_lookup, issue_title, redline_check, render_issue, select
from gt_collectors.signal import Geo, Signal
from gt_collectors.state import queue_id
from tests.conftest import NOW, make_signal

DAY = date(2026, 9, 16)


def candidate(n: int = 0, *, feed_id: str = "un-press-en", **overrides: Any) -> Candidate:
    signal = overrides.pop("signal", None) or make_signal(n)
    return Candidate(
        feed_id=feed_id,
        queue_id=queue_id(signal),
        signal=signal,
        **overrides,
    )


def signal_with(*, title: str = "Title", text: str = "Text", url: str = "https://x.example/a") -> Signal:
    return Signal(
        source_id=None,
        url=normalize_url(url),
        fetched_at=NOW,
        published_at=NOW,
        lang="en",
        title=title,
        text=text,
        raw_hash=sha256_prefixed(b"x"),
        geo=Geo(region="levant", precision="region"),
    )


def test_issue_title_carries_the_date() -> None:
    assert issue_title(DAY).endswith("2026-09-16")
    assert "Review queue" in issue_title(DAY)


@pytest.mark.parametrize(
    "text",
    [
        "Turkish forces crossed the area, the agency reported",
        "Türk Silahlı Kuvvetleri açıklama yaptı",
        "TSK kaynakları",
        "the Turkish navy escorted the vessel",
    ],
)
def test_redline_check_flags_turkish_forces(text: str) -> None:
    assert redline_check(signal_with(text=text))


@pytest.mark.parametrize(
    "text",
    [
        "A Turkish delegation visited the ministry",
        "TSKB issued a bond",
        "Turkish exports rose last quarter",
    ],
)
def test_redline_check_does_not_flag_unrelated_text(text: str) -> None:
    assert not redline_check(signal_with(text=text))


def test_body_states_that_items_are_unverified() -> None:
    body = render_issue([candidate(1)], day=DAY)
    assert "doğrulanmamış adaylardır" in body
    assert "unverified candidates, not published claims" in body
    assert "0007-human-in-the-loop-publishing" in body


def test_each_candidate_is_a_checklist_line_with_link_region_and_id() -> None:
    signal = make_signal(7)
    body = render_issue([candidate(7, archive_url="https://web.archive.org/web/2026/x")], day=DAY)
    line = next(line for line in body.splitlines() if line.startswith("- [ ]"))
    assert signal.title in line
    assert signal.url in line
    assert "web.archive.org" in line
    assert "`aegean`" in line  # the region guess
    assert f"`{queue_id(signal)}`" in line  # the dedup id
    assert "un-press-en" in line


def test_redline_candidates_are_marked() -> None:
    signal = signal_with(title="Statement on the border", text="Turkish forces crossed the area")
    flagged = candidate(signal=signal, feed_id="un-news-en", redline_check=redline_check(signal))
    body = render_issue([flagged], day=DAY)
    assert "redline_check" in body.split("## ")[1]


def test_markdown_in_a_title_cannot_forge_a_link() -> None:
    hostile = signal_with(title="Click [here](https://evil.example) **now**")
    body = render_issue([candidate(signal=hostile)], day=DAY)
    assert "(https://evil.example)" not in body
    assert "\\[here\\]" in body


def test_url_with_parentheses_stays_inside_the_link() -> None:
    signal = signal_with(url="https://example.org/news/item_(2026)?a=1")
    body = render_issue([candidate(signal=signal)], day=DAY)
    assert "(<https://example.org/news/item_(2026)?a=1>)" in body


def test_counts_and_deferred_note() -> None:
    stats = {"feeds": 3, "items": 90, "dropped": 2, "duplicates": 4, "known": 60, "errors": 1}
    body = render_issue([candidate(n) for n in range(3)], day=DAY, stats=stats, deferred=5)
    assert "| Görülen öğe / items seen | 90 |" in body
    assert "| Güvenlik süzgeci + geofence eledi / dropped by the safety filter | 2 |" in body
    assert "| Hatalı akış / feed errors | 1 |" in body
    assert "5 candidates did not fit in this run" in body


def test_empty_run_says_so() -> None:
    body = render_issue([], day=DAY, stats={"feeds": 3, "items": 12, "known": 12})
    assert "No new candidates in this run" in body


def test_body_stays_under_the_github_size_limit() -> None:
    many = [candidate(signal=signal_with(title="T" * 300, url=f"https://x.example/{n}")) for n in range(400)]
    body = render_issue(many, day=DAY, limit=20_000)
    assert len(body) <= 20_000
    assert "trimmed to stay under GitHub's issue size limit" in body
    assert "unverified candidates" in body  # the banner survives trimming


def test_select_takes_the_newest_and_defers_the_rest() -> None:
    signals = [
        Signal(
            source_id=None,
            url=normalize_url(f"https://x.example/{n}"),
            fetched_at=NOW,
            published_at=NOW - timedelta(hours=n),
            lang="en",
            title=f"Item {n}",
            text=f"Text {n}",
            raw_hash=sha256_prefixed(str(n).encode()),
        )
        for n in range(5)
    ]
    chosen, deferred = select([candidate(signal=s) for s in signals], 2)
    assert [c.signal.title for c in chosen] == ["Item 0", "Item 1"]  # newest first
    assert [c.signal.title for c in deferred] == ["Item 2", "Item 3", "Item 4"]
    assert select([candidate(signal=s) for s in signals], 10)[1] == []


def test_candidate_json_keeps_the_signal_contract() -> None:
    line = json.loads(candidate(3, archive_url=None, redline_check=True).to_json())
    assert set(line) == {
        "queue_id",
        "feed",
        "status",
        "archive_url",
        "redline_check",
        "relevance",
        "signal",
    }
    assert line["status"] == "queued" and line["relevance"] is None
    assert Signal.from_dict(line["signal"]).url == make_signal(3).url


class _FakeResponse:
    def __init__(self, payload: bytes) -> None:
        self.body = payload


def test_archive_lookup_returns_the_closest_snapshot() -> None:
    snapshot = {
        "archived_snapshots": {
            "closest": {"available": True, "url": "http://web.archive.org/web/2026/https://x.example/a"}
        }
    }

    def fetcher(url: str, **_kwargs: object) -> _FakeResponse:
        assert url.startswith(review.WAYBACK_API)
        return _FakeResponse(json.dumps(snapshot).encode())

    assert archive_lookup("https://x.example/a", fetcher=fetcher) == (
        "https://web.archive.org/web/2026/https://x.example/a"
    )


@pytest.mark.parametrize(
    "payload",
    [b"{}", b"not json", json.dumps({"archived_snapshots": {"closest": {"available": False}}}).encode()],
)
def test_archive_lookup_returns_none_when_there_is_no_snapshot(payload: bytes) -> None:
    assert archive_lookup("https://x.example/a", fetcher=lambda *_a, **_k: _FakeResponse(payload)) is None


def test_archive_lookup_survives_a_network_failure() -> None:
    def fetcher(*_args: object, **_kwargs: object) -> _FakeResponse:
        raise fetch.FetchError("offline")

    assert archive_lookup("https://x.example/a", fetcher=fetcher) is None
