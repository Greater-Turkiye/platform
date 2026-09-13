from __future__ import annotations

from datetime import UTC, datetime

import pytest

from gt_collectors.fetch import FetchResult
from gt_collectors.rss import EXCERPT_CHARS, FeedError, collect, parse_date, parse_feed, truncate
from tests.conftest import FIXTURES, NOW, SOURCE_ID, make_feed


def test_rss2_fixture() -> None:
    result = collect(make_feed(), body=(FIXTURES / "rss2.xml").read_bytes(), now=NOW)
    assert result.summary() == {
        "feed": "rss-test",
        "items": 6,
        "kept": 3,
        "invalid": 2,  # no link; javascript: link
        "duplicates": 1,  # same URL after tracking/port/case normalization + same text
        "dropped_by_safety_filter": 0,
        "not_modified": False,
    }
    first, second, third = result.signals
    assert first.url == "https://mod.example.org/news/1?id=1"
    assert first.title == "Minister visits “Exercise Blue Example”"
    assert first.text == "The minister observed the exercise. Second paragraph."
    assert first.published_at == datetime(2026, 9, 12, 6, 58, tzinfo=UTC)
    assert first.source_id == SOURCE_ID and first.lang == "en"
    assert first.geo.region == "aegean" and first.geo.lat is None
    assert second.url == "https://mod.example.org/news/2"  # relative link resolved, fragment dropped
    assert second.published_at == datetime(2026, 9, 11, 8, 0, tzinfo=UTC)
    assert third.url == "https://mod.example.org/news/3"  # guid permalink
    assert third.text == "Only content:encoded here."
    assert third.published_at is None
    assert all(s.fetched_at == NOW for s in result.signals)
    assert len({s.raw_hash for s in result.signals}) == 3


def test_atom_fixture() -> None:
    result = collect(make_feed(lang="el", regions=()), body=(FIXTURES / "atom.xml").read_bytes(), now=NOW)
    a, b = result.signals
    assert a.url == "https://mfa.example.gr/el/news/7"  # rel=alternate preferred over self
    assert a.title == "Ανακοίνωση Τύπου"
    assert a.text == "Σύντομο κείμενο."
    assert a.published_at == datetime(2026, 9, 12, 4, 30, tzinfo=UTC)
    assert a.geo.region is None
    assert b.text == "XHTML content."
    assert b.published_at == datetime(2026, 9, 11, 12, 0, tzinfo=UTC)


def test_rdf_fixture() -> None:
    items = parse_feed((FIXTURES / "rdf.xml").read_bytes())
    assert [(i.title, i.link) for i in items] == [("Statement one", "https://gs.example.net/s/1")]


def test_rejects_entity_declarations() -> None:
    bomb = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><rss><channel/></rss>'
    with pytest.raises(FeedError, match="entities"):
        parse_feed(bomb)
    xxe = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss>&x;</rss>'
    with pytest.raises(FeedError):
        parse_feed(xxe)


@pytest.mark.parametrize("doc", [b"<html><body/></html>", b"<rss><item>", b"", b"<rss version='2.0'/>"])
def test_rejects_non_feeds(doc: bytes) -> None:
    with pytest.raises(FeedError):
        parse_feed(doc)


def test_bom_and_leading_whitespace_tolerated() -> None:
    doc = b"\xef\xbb\xbf\n  <rss><channel><item><title>t</title><link>https://a.example/x</link></item></channel></rss>"
    assert parse_feed(doc)[0].link == "https://a.example/x"


def test_long_text_is_truncated_not_copied() -> None:
    long = " ".join(["word"] * 400)
    doc = f"<rss><channel><item><title>t</title><link>https://a.example/x</link><description>{long}</description></item></channel></rss>"
    signal = collect(make_feed(), body=doc.encode(), now=NOW).signals[0]
    assert len(signal.text) <= EXCERPT_CHARS and signal.text.endswith("…")


def test_future_dates_are_dropped() -> None:
    doc = (
        b"<rss><channel><item><link>https://a.example/x</link>"
        b"<pubDate>Mon, 01 Jan 2035 00:00:00 GMT</pubDate></item></channel></rss>"
    )
    assert collect(make_feed(), body=doc, now=NOW).signals[0].published_at is None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Sat, 12 Sep 2026 09:58:00 +0300", datetime(2026, 9, 12, 6, 58, tzinfo=UTC)),
        ("Sat, 12 Sep 2026 09:58:00 GMT", datetime(2026, 9, 12, 9, 58, tzinfo=UTC)),
        ("2026-09-12T09:58:00Z", datetime(2026, 9, 12, 9, 58, tzinfo=UTC)),
        ("2026-09-12T09:58:00.123+04:00", datetime(2026, 9, 12, 5, 58, tzinfo=UTC)),
        ("2026-09-12", datetime(2026, 9, 12, tzinfo=UTC)),
        ("yesterday", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_date(value: str | None, expected: datetime | None) -> None:
    assert parse_date(value) == expected


def test_truncate() -> None:
    assert truncate("short", 10) == "short"
    assert truncate("alpha beta gamma delta", 12) == "alpha beta…"
    assert len(truncate("x" * 50, 10)) == 10


def test_collect_uses_fetcher_and_handles_304() -> None:
    calls = []

    def fetcher(url: str, **kwargs: object) -> FetchResult:
        calls.append((url, kwargs))
        return FetchResult(status=304, url=url, body=b"", headers={"etag": '"v2"'})

    result = collect(make_feed(), fetcher=fetcher, etag='"v1"', now=NOW)
    assert result.not_modified and result.signals == [] and result.etag == '"v2"'
    assert calls == [("https://mod.example.org/feed.xml", {"etag": '"v1"', "last_modified": None})]


def test_collect_resolves_links_against_final_url() -> None:
    body = b"<rss><channel><item><title>t</title><link>news/9</link></item></channel></rss>"

    def fetcher(url: str, **_kwargs: object) -> FetchResult:
        return FetchResult(status=200, url="https://www.mod.example.org/en/rss/", body=body)

    result = collect(make_feed(), fetcher=fetcher, now=NOW)
    assert result.signals[0].url == "https://www.mod.example.org/en/rss/news/9"
