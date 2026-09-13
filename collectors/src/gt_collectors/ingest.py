"""HMAC-signed batch client for the ``api`` Worker's ``POST /v1/ingest`` (apps/api/README.md).

Headers::

    X-GT-Timestamp: <unix seconds>
    X-GT-Signature: sha256=<hex(HMAC-SHA256(key, timestamp + "." + raw_body))>

Body (UTF-8 JSON, at most :data:`MAX_BATCH` signals)::

    {
      "schema": "gt-ingest/1",
      "collector_id": "rss-aze-mod",
      "sent_at": "2026-09-12T10:15:03Z",
      "signals": [ { <signal contract fields>, "content_hash": "sha256:…", "simhash": "<16 hex>" } ]
    }

``content_hash`` and ``simhash`` are derived hints: the Worker recomputes ``content_hash``
(and should reject a mismatch, which would reveal normalization drift between Python and JS);
``simhash`` is advisory (near-duplicate detection), hex-encoded because JSON numbers cannot
carry 64-bit integers into JavaScript.

:meth:`IngestClient.send` applies the safety filter once more before encoding (defence in
depth; the Worker applies it a third time).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from gt_collectors import fetch, safety
from gt_collectors.signal import Signal, format_ts
from gt_collectors.simhash import to_hex

MAX_BATCH = 100
MAX_SKEW_SECONDS = 300
ENVELOPE_SCHEMA = "gt-ingest/1"
TIMESTAMP_HEADER = "X-GT-Timestamp"
SIGNATURE_HEADER = "X-GT-Signature"


def signature(body: bytes, key: bytes, timestamp: int) -> str:
    mac = hmac.new(key, str(timestamp).encode("ascii") + b"." + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def sign(body: bytes, key: bytes, timestamp: int | None = None) -> dict[str, str]:
    if not key:
        raise ValueError("empty HMAC key")
    ts = int(time.time()) if timestamp is None else int(timestamp)
    return {TIMESTAMP_HEADER: str(ts), SIGNATURE_HEADER: signature(body, key, ts)}


def verify(
    body: bytes,
    timestamp: str,
    signature_header: str,
    keys: Sequence[bytes],
    *,
    now: float | None = None,
    max_skew: int = MAX_SKEW_SECONDS,
) -> bool:
    """Reference verifier mirroring the Worker (current + previous key, constant-time compare)."""
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    now = time.time() if now is None else now
    if abs(now - ts) > max_skew:
        return False
    ok = False
    for key in keys:
        if key:
            ok |= hmac.compare_digest(signature(body, key, ts), signature_header or "")
    return ok


def iter_batches(items: Sequence[Any], size: int = MAX_BATCH) -> Iterator[Sequence[Any]]:
    if not 1 <= size <= MAX_BATCH:
        raise ValueError(f"batch size must be 1..{MAX_BATCH}")
    for i in range(0, len(items), size):
        yield items[i : i + size]


def signal_payload(signal: Signal) -> dict[str, Any]:
    payload = signal.to_dict()
    payload["content_hash"] = signal.content_hash()
    payload["simhash"] = to_hex(signal.simhash())
    return payload


def encode_batch(collector_id: str, signals: Sequence[Signal], *, sent_at: datetime | None = None) -> bytes:
    if len(signals) > MAX_BATCH:
        raise ValueError(f"a batch holds at most {MAX_BATCH} signals")
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "collector_id": collector_id,
        "sent_at": format_ts(sent_at or datetime.now(UTC)),
        "signals": [signal_payload(s) for s in signals],
    }
    return json.dumps(envelope, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def check_endpoint(url: str) -> str:
    parts = urlsplit(url)
    local = parts.hostname in {"localhost", "127.0.0.1", "::1"}
    if parts.scheme != "https" and not (parts.scheme == "http" and local):
        raise ValueError("ingest endpoint must use https (http only for localhost)")
    return url


@dataclass
class SendReport:
    batches: int = 0
    sent: int = 0
    dropped_by_filter: int = 0
    statuses: list[int] = field(default_factory=list)


class IngestClient:
    def __init__(
        self,
        endpoint: str,
        key: bytes,
        collector_id: str,
        *,
        post: Callable[..., fetch.FetchResult] = fetch.post,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if not key:
            raise ValueError("INGEST_HMAC_KEY is empty")
        self.endpoint = check_endpoint(endpoint)
        self.key = key
        self.collector_id = collector_id
        self._post = post
        self._clock = clock

    def send(self, signals: Iterable[Signal]) -> SendReport:
        signals = list(signals)
        missing = sum(1 for s in signals if s.source_id is None)
        if missing:
            raise ValueError(f"{missing} signal(s) have no source_id; register the source in datasets first")
        filtered = safety.filter_signals(signals)
        report = SendReport(dropped_by_filter=filtered.dropped)
        for batch in iter_batches(filtered.kept):
            now = self._clock()
            body = encode_batch(self.collector_id, batch, sent_at=datetime.fromtimestamp(now, UTC))
            headers = {"Content-Type": "application/json; charset=utf-8", **sign(body, self.key, int(now))}
            result = self._post(self.endpoint, body, headers)
            report.batches += 1
            report.sent += len(batch)
            report.statuses.append(result.status)
        return report
