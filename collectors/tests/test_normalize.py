from __future__ import annotations

import hashlib

import pytest

from gt_collectors.normalize import InvalidURL, content_hash, normalize_text, normalize_url


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("HTTPS://Example.ORG:443/a?b=2&a=1&utm_source=x#frag", "https://example.org/a?a=1&b=2"),
        ("http://example.org", "http://example.org/"),
        ("http://example.org:80/x", "http://example.org/x"),
        ("http://example.org:8080/x", "http://example.org:8080/x"),
        ("https://user:pw@example.org/x", "https://example.org/x"),
        ("https://example.org./x", "https://example.org/x"),
        ("https://example.org/x?FBCLID=1&q=a%20b", "https://example.org/x?q=a%20b"),
        ("https://example.org/x?&&a=1&", "https://example.org/x?a=1"),
        ("https://example.org/x?utm_campaign", "https://example.org/x"),
        ("https://example.org/x?gclid=1&pk_campaign=2&mtm_source=3&_ga=4", "https://example.org/x"),
        ("https://example.org/x?ref=keep", "https://example.org/x?ref=keep"),
        ("https://example.org/#!/news/1", "https://example.org/#!/news/1"),
        ("https://example.org/app#/route", "https://example.org/app#/route"),
        ("  https://example.org/Case/Path  ", "https://example.org/Case/Path"),
        ("http://[::1]:8080/x", "http://[::1]:8080/x"),
    ],
)
def test_normalize_url(raw: str, expected: str) -> None:
    assert normalize_url(raw) == expected
    assert normalize_url(expected) == expected  # idempotent


@pytest.mark.parametrize(
    "raw",
    ["ftp://example.org/x", "javascript:alert(1)", "https:///x", "not a url", "http://example.org:99999/"],
)
def test_normalize_url_rejects(raw: str) -> None:
    with pytest.raises(InvalidURL):
        normalize_url(raw)


def test_normalize_text() -> None:
    assert normalize_text("  a  b\n\tc d﻿ ") == "a b c d"
    assert normalize_text("é") == "é"  # NFC
    assert normalize_text(None) == ""


def test_content_hash_known_vector() -> None:
    expected = "sha256:" + hashlib.sha256(b"https://example.org/a\nHello world").hexdigest()
    assert content_hash("https://example.org/a", "Hello  world") == expected


def test_content_hash_ignores_tracking_whitespace_and_composition() -> None:
    a = content_hash("https://example.org/a?id=1&utm_medium=rss", "Café  news")
    b = content_hash("HTTPS://EXAMPLE.org/a?fbclid=z&id=1#top", " Café news ")
    assert a == b
    assert a != content_hash("https://example.org/a?id=2", "Café news")
