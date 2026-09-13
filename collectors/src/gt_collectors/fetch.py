"""Tiny HTTP helper: timeout, descriptive User-Agent, conditional GET, bounded retries.

Why ``urllib`` and not ``httpx``: collectors make a handful of sequential GETs and one POST
per batch. The standard library covers that (TLS verification with the system trust store,
redirects, timeouts), and every extra dependency is supply-chain surface for a job that
holds the ingest HMAC key (ADR 0011, threat 8). The few things urllib lacks — gzip,
retry/back-off with ``Retry-After``, a response size cap, 304 handling — are ~100 lines here.

Tests inject ``opener`` so no network is used.
"""

from __future__ import annotations

import gzip
import time
import urllib.error
import urllib.request
import zlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from typing import Any, Protocol

from gt_collectors import USER_AGENT

DEFAULT_TIMEOUT = 20.0
DEFAULT_RETRIES = 2
MAX_BYTES = 5 * 1024 * 1024
MAX_RETRY_AFTER = 60.0
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


class FetchError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class _Response(Protocol):
    status: int
    headers: Mapping[str, str]

    def geturl(self) -> str: ...
    def read(self, amt: int = ...) -> bytes: ...
    def close(self) -> None: ...


Opener = Callable[[urllib.request.Request, float], _Response]


def _default_opener(request: urllib.request.Request, timeout: float) -> _Response:
    return urllib.request.urlopen(request, timeout=timeout)  # noqa: S310 - scheme checked in request()


@dataclass
class FetchResult:
    status: int
    url: str
    body: bytes
    headers: dict[str, str] = field(default_factory=dict)

    @property
    def not_modified(self) -> bool:
        return self.status == 304

    @property
    def etag(self) -> str | None:
        return self.headers.get("etag")

    @property
    def last_modified(self) -> str | None:
        return self.headers.get("last-modified")


def _retry_after(headers: Mapping[str, str], fallback: float) -> float:
    value = headers.get("retry-after") or headers.get("Retry-After")
    if not value:
        return fallback
    try:
        return min(max(float(value), 0.0), MAX_RETRY_AFTER)
    except ValueError:
        pass
    try:
        delay = parsedate_to_datetime(value).timestamp() - time.time()
        return min(max(delay, 0.0), MAX_RETRY_AFTER)
    except (TypeError, ValueError):
        return fallback


def _decode(body: bytes, encoding: str | None) -> bytes:
    enc = (encoding or "").lower()
    if enc == "gzip":
        return gzip.decompress(body)
    if enc == "deflate":
        return zlib.decompress(body)
    return body


def request(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    etag: str | None = None,
    last_modified: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
    backoff: float = 2.0,
    max_bytes: int = MAX_BYTES,
    opener: Opener | None = None,
    sleep: Callable[[float], Any] | None = None,
) -> FetchResult:
    """Perform an HTTP request; retry on network errors, 429 and 5xx (``retries`` extra attempts).

    Returns 2xx and 304 responses; raises :class:`FetchError` otherwise.
    """
    if not url.lower().startswith(("https://", "http://")):
        raise FetchError(f"refusing non-http(s) URL: {url!r}")
    opener = opener or _default_opener
    sleep = sleep or time.sleep
    hdrs = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}
    if etag:
        hdrs["If-None-Match"] = etag
    if last_modified:
        hdrs["If-Modified-Since"] = last_modified
    hdrs.update(headers or {})

    attempt = 0
    while True:
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method)  # noqa: S310 - checked above
        delay = backoff * (2**attempt)
        try:
            resp = opener(req, timeout)
            try:
                raw = resp.read(max_bytes + 1)
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                final_url = resp.geturl()
                status = resp.status
            finally:
                resp.close()
            if len(raw) > max_bytes:
                raise FetchError(f"response larger than {max_bytes} bytes", status)
            body = _decode(raw, resp_headers.get("content-encoding"))
            if len(body) > max_bytes:
                raise FetchError(f"decoded response larger than {max_bytes} bytes", status)
            return FetchResult(status=status, url=final_url, body=body, headers=resp_headers)
        except urllib.error.HTTPError as exc:
            if exc.code == 304:
                return FetchResult(
                    status=304, url=url, body=b"", headers={k.lower(): v for k, v in exc.headers.items()}
                )
            if exc.code not in RETRY_STATUSES or attempt >= retries:
                raise FetchError(f"HTTP {exc.code} for {url}", exc.code) from None
            delay = _retry_after(exc.headers or {}, delay)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            if attempt >= retries:
                raise FetchError(f"network error for {url}: {exc}") from None
        attempt += 1
        sleep(delay)


def get(url: str, **kwargs: Any) -> FetchResult:
    return request(url, **kwargs)


def post(url: str, body: bytes, headers: Mapping[str, str], **kwargs: Any) -> FetchResult:
    return request(url, method="POST", data=body, headers=headers, **kwargs)
