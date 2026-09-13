from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from gt_collectors.fetch import FetchResult
from gt_collectors.ingest import (
    MAX_BATCH,
    IngestClient,
    check_endpoint,
    encode_batch,
    iter_batches,
    sign,
    verify,
)
from gt_collectors.signal import SIGNAL_KEYS
from tests.conftest import make_signal

KEY = b"test-key-not-a-secret"
BODY = b'{"schema":"gt-ingest/1"}'


def test_sign_known_vector() -> None:
    headers = sign(BODY, KEY, 1_757_671_200)
    expected = hmac.new(KEY, b"1757671200." + BODY, hashlib.sha256).hexdigest()
    assert headers == {"X-GT-Timestamp": "1757671200", "X-GT-Signature": f"sha256={expected}"}


def test_verify_accepts_current_and_previous_key() -> None:
    h = sign(BODY, KEY, 1000)
    ts, sig = h["X-GT-Timestamp"], h["X-GT-Signature"]
    assert verify(BODY, ts, sig, [KEY], now=1000)
    assert verify(BODY, ts, sig, [b"new-key", KEY], now=1100)
    assert not verify(BODY, ts, sig, [b"other"], now=1000)
    assert not verify(BODY + b" ", ts, sig, [KEY], now=1000)


def test_verify_rejects_clock_skew() -> None:
    h = sign(BODY, KEY, 1000)
    assert verify(BODY, h["X-GT-Timestamp"], h["X-GT-Signature"], [KEY], now=1300)
    assert not verify(BODY, h["X-GT-Timestamp"], h["X-GT-Signature"], [KEY], now=1301)
    assert not verify(BODY, "not-a-number", h["X-GT-Signature"], [KEY], now=1000)


def test_sign_rejects_empty_key() -> None:
    with pytest.raises(ValueError):
        sign(BODY, b"", 1)


def test_iter_batches_limits() -> None:
    assert [len(b) for b in iter_batches(list(range(250)))] == [100, 100, 50]
    with pytest.raises(ValueError):
        list(iter_batches([1], size=101))


def test_encode_batch_envelope() -> None:
    signals = [make_signal(i) for i in range(3)]
    envelope = json.loads(encode_batch("rss-test", signals))
    assert envelope["schema"] == "gt-ingest/1" and envelope["collector_id"] == "rss-test"
    item = envelope["signals"][0]
    assert set(item) == {*SIGNAL_KEYS, "content_hash", "simhash"}
    assert item["content_hash"] == signals[0].content_hash()
    assert len(item["simhash"]) == 16
    with pytest.raises(ValueError):
        encode_batch("rss-test", [make_signal(0)] * (MAX_BATCH + 1))


class FakePost:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bytes, dict]] = []

    def __call__(self, url: str, body: bytes, headers: dict) -> FetchResult:
        self.calls.append((url, body, headers))
        return FetchResult(status=200, url=url, body=b'{"accepted":1}')


def test_client_sends_signed_batches_of_at_most_100() -> None:
    post = FakePost()
    client = IngestClient(
        "https://api.example.org/v1/ingest", KEY, "rss-test", post=post, clock=lambda: 5000.0
    )
    report = client.send([make_signal(i) for i in range(205)])
    assert report.batches == 3 and report.sent == 205 and report.statuses == [200, 200, 200]
    for url, body, headers in post.calls:
        assert url == "https://api.example.org/v1/ingest"
        assert verify(body, headers["X-GT-Timestamp"], headers["X-GT-Signature"], [KEY], now=5000)
        assert len(json.loads(body)["signals"]) <= MAX_BATCH


def test_client_reapplies_safety_filter_before_sending() -> None:
    post = FakePost()
    client = IngestClient("https://api.example.org/v1/ingest", KEY, "rss-test", post=post)
    report = client.send([make_signal(1), make_signal(2, lat=39.93, lon=32.86)])
    assert report.dropped_by_filter == 1 and report.sent == 1
    sent = json.loads(post.calls[0][1])["signals"]
    assert [s["title"] for s in sent] == ["Synthetic item 1"]
    assert b"32.86" not in post.calls[0][1]


def test_client_refuses_unregistered_sources() -> None:
    client = IngestClient("https://api.example.org/v1/ingest", KEY, "rss-test", post=FakePost())
    with pytest.raises(ValueError, match="source_id"):
        client.send([make_signal(1, source_id=None)])


@pytest.mark.parametrize("url", ["http://api.example.org/v1/ingest", "ftp://x/y"])
def test_endpoint_must_be_https(url: str) -> None:
    with pytest.raises(ValueError):
        check_endpoint(url)


def test_localhost_http_allowed_for_wrangler_dev() -> None:
    assert check_endpoint("http://localhost:8787/v1/ingest")
    with pytest.raises(ValueError):
        IngestClient("https://api.example.org/", b"", "rss-test")
