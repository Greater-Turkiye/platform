"""Normalized signal model — the output contract in collectors/README.md.

JSON shape (exactly these keys)::

    {
      "source_id": "src_…" | null,
      "url": "https://example.org/news/123",
      "fetched_at": "2026-09-12T10:15:00Z",
      "published_at": "2026-09-12T09:58:00Z" | null,
      "lang": "en",
      "title": "…",
      "text": "…",
      "geo": {"region": "aegean", "place": null, "lat": null, "lon": null, "precision": "region"},
      "raw_hash": "sha256:…"
    }

``source_id`` may be ``null`` only while the source has no ``datasets`` registry record yet;
such signals can be printed with ``--dry-run`` but are never sent to ingest.
Derived values (``content_hash``, ``simhash``) are methods here and travel only in the ingest
batch envelope (:mod:`gt_collectors.ingest`), so the contract itself stays unchanged.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from gt_collectors import simhash as _simhash
from gt_collectors.normalize import content_hash as _content_hash
from gt_collectors.normalize import normalize_url

TITLE_MAX = 300
TEXT_MAX = 1000

SOURCE_ID_RE = re.compile(r"^src_[0-7][0-9a-hjkmnp-tv-z]{25}$")
LANG_RE = re.compile(r"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
CODE_RE = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
RAW_HASH_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SIGNAL_KEYS = ("source_id", "url", "fetched_at", "published_at", "lang", "title", "text", "geo", "raw_hash")
GEO_KEYS = ("region", "place", "lat", "lon", "precision")


def format_ts(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        raise ValueError(f"timestamp without timezone: {value!r}")
    return dt.astimezone(UTC)


def _check_utc(name: str, value: datetime | None, *, required: bool) -> None:
    if value is None:
        if required:
            raise ValueError(f"{name} is required")
        return
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() != UTC.utcoffset(None):
        raise ValueError(f"{name} must be a timezone-aware UTC datetime")


@dataclass(frozen=True, slots=True)
class Geo:
    region: str | None = None
    place: str | None = None
    lat: float | None = None
    lon: float | None = None
    precision: str | None = None

    def __post_init__(self) -> None:
        if self.region is not None and not CODE_RE.match(self.region):
            raise ValueError(f"geo.region must be a vocabulary code, got {self.region!r}")
        if self.precision is not None and not CODE_RE.match(self.precision):
            raise ValueError(f"geo.precision must be a code, got {self.precision!r}")
        if self.place is not None and (not isinstance(self.place, str) or len(self.place) > 200):
            raise ValueError("geo.place must be a string of at most 200 characters")
        # Coordinates are validated for shape only; the safety filter decides what may pass.
        for name in ("lat", "lon"):
            v = getattr(self, name)
            if v is not None and (
                isinstance(v, bool) or not isinstance(v, int | float) or not math.isfinite(v)
            ):
                raise ValueError(f"geo.{name} must be a finite number or null")

    def to_dict(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in GEO_KEYS}


@dataclass(frozen=True, slots=True)
class Signal:
    source_id: str | None
    url: str
    fetched_at: datetime
    published_at: datetime | None
    lang: str
    title: str
    text: str
    raw_hash: str
    geo: Geo = field(default_factory=Geo)

    def __post_init__(self) -> None:
        if self.source_id is not None and not SOURCE_ID_RE.match(self.source_id):
            raise ValueError(f"source_id must look like src_<26 chars>, got {self.source_id!r}")
        if normalize_url(self.url) != self.url:
            raise ValueError("url must already be normalized (use normalize_url)")
        _check_utc("fetched_at", self.fetched_at, required=True)
        _check_utc("published_at", self.published_at, required=False)
        if not LANG_RE.match(self.lang):
            raise ValueError(f"lang must be a BCP 47 tag, got {self.lang!r}")
        if not isinstance(self.title, str) or len(self.title) > TITLE_MAX:
            raise ValueError(f"title must be a string of at most {TITLE_MAX} characters")
        if not isinstance(self.text, str) or len(self.text) > TEXT_MAX:
            raise ValueError(f"text must be a string of at most {TEXT_MAX} characters (truncate, never copy)")
        if not RAW_HASH_RE.match(self.raw_hash):
            raise ValueError("raw_hash must be sha256:<64 hex>")
        if not isinstance(self.geo, Geo):
            raise ValueError("geo must be a Geo")

    def content_hash(self) -> str:
        return _content_hash(self.url, self.text)

    def simhash(self) -> int:
        return _simhash.simhash(f"{self.title}\n{self.text}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "url": self.url,
            "fetched_at": format_ts(self.fetched_at),
            "published_at": format_ts(self.published_at) if self.published_at else None,
            "lang": self.lang,
            "title": self.title,
            "text": self.text,
            "geo": self.geo.to_dict(),
            "raw_hash": self.raw_hash,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Signal:
        if set(data) != set(SIGNAL_KEYS):
            raise ValueError(f"signal keys must be exactly {SIGNAL_KEYS}")
        geo = data["geo"] or {}
        if set(geo) - set(GEO_KEYS):
            raise ValueError(f"unexpected geo keys: {sorted(set(geo) - set(GEO_KEYS))}")
        return cls(
            source_id=data["source_id"],
            url=data["url"],
            fetched_at=parse_ts(data["fetched_at"]),
            published_at=parse_ts(data["published_at"]) if data["published_at"] else None,
            lang=data["lang"],
            title=data["title"],
            text=data["text"],
            raw_hash=data["raw_hash"],
            geo=Geo(**geo),
        )
