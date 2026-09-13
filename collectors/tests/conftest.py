from __future__ import annotations

import socket
from datetime import UTC, datetime
from pathlib import Path

import pytest

from gt_collectors.config import FeedConfig
from gt_collectors.normalize import normalize_url, sha256_prefixed
from gt_collectors.signal import Geo, Signal

FIXTURES = Path(__file__).parent / "fixtures"
COLLECTORS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = COLLECTORS_DIR.parent
SOURCE_ID = "src_01m2bez3g6fgwb9nhs14271a8f"  # format-valid placeholder
NOW = datetime(2026, 9, 12, 10, 15, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests must never touch the network."""

    def guard(*_args: object, **_kwargs: object) -> None:
        # An OSError, so code under test sees an ordinary (retryable) network failure.
        raise ConnectionRefusedError("network access is not allowed in tests")

    monkeypatch.setattr(socket.socket, "connect", guard)
    monkeypatch.setattr(socket, "create_connection", guard)
    monkeypatch.setattr(socket, "getaddrinfo", guard)


def make_signal(
    n: int = 0,
    *,
    lat: float | None = None,
    lon: float | None = None,
    source_id: str | None = SOURCE_ID,
    text: str | None = None,
) -> Signal:
    return Signal(
        source_id=source_id,
        url=normalize_url(f"https://news.example.org/item/{n}"),
        fetched_at=NOW,
        published_at=NOW,
        lang="en",
        title=f"Synthetic item {n}",
        text=text if text is not None else f"Synthetic text number {n}.",
        raw_hash=sha256_prefixed(str(n).encode()),
        geo=Geo(region="aegean", lat=lat, lon=lon, precision="point" if lat is not None else "region"),
    )


def make_feed(**overrides: object) -> FeedConfig:
    base = {
        "id": "rss-test",
        "kind": "rss",
        "url": "https://mod.example.org/feed.xml",
        "cadence_minutes": 30,
        "lang": "en",
        "enabled": False,
        "source_id": SOURCE_ID,
        "regions": ("aegean",),
    }
    base.update(overrides)
    return FeedConfig(**base)
