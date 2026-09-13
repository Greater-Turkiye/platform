from __future__ import annotations

import gzip
import urllib.error
from email.message import Message

import pytest

from gt_collectors import USER_AGENT
from gt_collectors.fetch import FetchError, request


class FakeResponse:
    def __init__(self, body: bytes, status: int = 200, headers: dict | None = None, url: str = "") -> None:
        self._body, self.status, self.headers, self._url = body, status, headers or {}, url

    def geturl(self) -> str:
        return self._url

    def read(self, amt: int = -1) -> bytes:
        return self._body if amt < 0 else self._body[:amt]

    def close(self) -> None:
        pass


def http_error(code: int, headers: dict | None = None) -> urllib.error.HTTPError:
    msg = Message()
    for k, v in (headers or {}).items():
        msg[k] = v
    return urllib.error.HTTPError("https://x.example/", code, "err", msg, None)


class Script:
    """Opener that replays a list of responses/exceptions and records requests."""

    def __init__(self, *steps: object) -> None:
        self.steps = list(steps)
        self.requests: list = []

    def __call__(self, req: object, timeout: float) -> FakeResponse:
        self.requests.append((req, timeout))
        step = self.steps.pop(0)
        if isinstance(step, BaseException):
            raise step
        return step


def test_success_sets_headers_and_decodes_gzip() -> None:
    opener = Script(
        FakeResponse(gzip.compress(b"<rss/>"), headers={"Content-Encoding": "gzip", "ETag": '"v1"'})
    )
    result = request("https://x.example/feed", opener=opener, etag='"v0"', last_modified="Sat, 12 Sep 2026")
    assert result.body == b"<rss/>" and result.etag == '"v1"'
    req, timeout = opener.requests[0]
    assert req.get_header("User-agent") == USER_AGENT
    assert req.get_header("If-none-match") == '"v0"'
    assert req.get_header("If-modified-since") == "Sat, 12 Sep 2026"
    assert timeout == 20.0


def test_304_is_not_modified() -> None:
    result = request("https://x.example/feed", opener=Script(http_error(304)), etag='"v1"')
    assert result.not_modified and result.body == b""


def test_retries_5xx_and_honours_retry_after() -> None:
    sleeps: list[float] = []
    opener = Script(http_error(503, {"Retry-After": "7"}), TimeoutError(), FakeResponse(b"ok"))
    result = request("https://x.example/feed", opener=opener, sleep=sleeps.append, retries=2, backoff=1.0)
    assert result.body == b"ok"
    assert sleeps == [7.0, 2.0]


def test_retry_after_is_capped() -> None:
    sleeps: list[float] = []
    opener = Script(http_error(429, {"Retry-After": "3600"}), FakeResponse(b"ok"))
    request("https://x.example/feed", opener=opener, sleep=sleeps.append)
    assert sleeps == [60.0]


def test_gives_up_after_retries() -> None:
    opener = Script(http_error(502), http_error(502), http_error(502))
    with pytest.raises(FetchError) as exc:
        request("https://x.example/feed", opener=opener, sleep=lambda _s: None, retries=2)
    assert exc.value.status == 502
    assert len(opener.requests) == 3


def test_does_not_retry_4xx() -> None:
    opener = Script(http_error(403))
    with pytest.raises(FetchError):
        request("https://x.example/feed", opener=opener, sleep=lambda _s: None)
    assert len(opener.requests) == 1


def test_network_error_is_retried_then_raised() -> None:
    opener = Script(urllib.error.URLError("down"), urllib.error.URLError("down"))
    with pytest.raises(FetchError, match="network error"):
        request("https://x.example/feed", opener=opener, sleep=lambda _s: None, retries=1)


def test_size_cap() -> None:
    with pytest.raises(FetchError, match="larger"):
        request("https://x.example/feed", opener=Script(FakeResponse(b"x" * 11)), max_bytes=10)
    bomb = gzip.compress(b"x" * 1000)
    with pytest.raises(FetchError, match="decoded"):
        request(
            "https://x.example/feed",
            opener=Script(FakeResponse(bomb, headers={"Content-Encoding": "gzip"})),
            max_bytes=100,
        )


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://x.example/", "x.example/feed"])
def test_refuses_non_http(url: str) -> None:
    with pytest.raises(FetchError):
        request(url, opener=Script())
