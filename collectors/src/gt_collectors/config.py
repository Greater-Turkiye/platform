"""Collector configuration (YAML). Strict: unknown keys and invalid values are errors.

``collectors/config/feeds.yaml``::

    feeds:
      - id: rss-example-mod          # unique, [a-z0-9-]
        kind: rss
        name: Example Ministry of Defence (press releases)
        country: XXX                 # ISO 3166-1 alpha-3
        source_id: null              # src_… once registered in datasets; required to send
        url: https://example.org/feed.xml
        cadence_minutes: 60          # >= 15
        lang: en
        regions: [aegean]            # datasets vocab/regions.yaml codes
        enabled: false               # ingest: stays false until the source has a source_id
        queue: false                 # review queue: true when the terms allow link + excerpt
        secrets: []
        terms: https://example.org/terms   # optional; required when queue is true
        notes: free text             # optional

``enabled`` and ``queue`` are two different gates and neither implies the other:

``enabled``
    The feed may be **sent to the ingest Worker**. It also needs a ``source_id`` from the
    datasets source registry, which is why every feed is still false.
``queue``
    The feed may be collected into the **human review queue** (one GitHub issue per scheduled
    run, ``.github/workflows/collect.yml``), which stores nothing but a link, a title and a
    ≤500-character excerpt and publishes nothing. A maintainer sets it to true only after
    reading the source's terms, so ``terms`` is required with it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from gt_collectors.signal import CODE_RE, LANG_RE, SOURCE_ID_RE

MIN_CADENCE_MINUTES = 15
KINDS = frozenset({"rss"})
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
COUNTRY_RE = re.compile(r"^[A-Z]{3}$")
SECRET_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,63}$")
REQUIRED = ("id", "kind", "url", "cadence_minutes", "lang", "enabled")
OPTIONAL = ("name", "country", "source_id", "regions", "queue", "secrets", "terms", "notes")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class FeedConfig:
    id: str
    kind: str
    url: str
    cadence_minutes: int
    lang: str
    enabled: bool
    queue: bool = False
    name: str | None = None
    country: str | None = None
    source_id: str | None = None
    regions: tuple[str, ...] = ()
    secrets: tuple[str, ...] = ()
    terms: str | None = None
    notes: str | None = None


def _feed(raw: Any, where: str) -> FeedConfig:
    if not isinstance(raw, dict):
        raise ConfigError(f"{where}: each feed must be a mapping")
    unknown = set(raw) - set(REQUIRED) - set(OPTIONAL)
    if unknown:
        raise ConfigError(f"{where}: unknown keys {sorted(unknown)}")
    missing = [k for k in REQUIRED if k not in raw]
    if missing:
        raise ConfigError(f"{where}: missing keys {missing}")
    fid = raw["id"]
    if not isinstance(fid, str) or not ID_RE.match(fid):
        raise ConfigError(f"{where}: invalid id {fid!r}")
    where = f"{where} ({fid})"
    if raw["kind"] not in KINDS:
        raise ConfigError(f"{where}: kind must be one of {sorted(KINDS)}")
    url = raw["url"]
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        raise ConfigError(f"{where}: url must be http(s)")
    cadence = raw["cadence_minutes"]
    if isinstance(cadence, bool) or not isinstance(cadence, int) or cadence < MIN_CADENCE_MINUTES:
        raise ConfigError(f"{where}: cadence_minutes must be an integer >= {MIN_CADENCE_MINUTES}")
    if not isinstance(raw["lang"], str) or not LANG_RE.match(raw["lang"]):
        raise ConfigError(f"{where}: lang must be a BCP 47 tag")
    if not isinstance(raw["enabled"], bool):
        raise ConfigError(f"{where}: enabled must be true or false")
    queue = raw.get("queue", False)
    if not isinstance(queue, bool):
        raise ConfigError(f"{where}: queue must be true or false")
    if queue and not raw.get("terms"):
        raise ConfigError(f"{where}: queue feeds must record the source's terms URL")
    source_id = raw.get("source_id")
    if source_id is not None and (not isinstance(source_id, str) or not SOURCE_ID_RE.match(source_id)):
        raise ConfigError(f"{where}: source_id must be null or src_<26 chars>")
    country = raw.get("country")
    if country is not None and (not isinstance(country, str) or not COUNTRY_RE.match(country)):
        raise ConfigError(f"{where}: country must be ISO 3166-1 alpha-3")
    regions = raw.get("regions") or []
    if not isinstance(regions, list) or not all(isinstance(r, str) and CODE_RE.match(r) for r in regions):
        raise ConfigError(f"{where}: regions must be a list of codes")
    secrets = raw.get("secrets") or []
    if not isinstance(secrets, list) or not all(isinstance(s, str) and SECRET_RE.match(s) for s in secrets):
        raise ConfigError(f"{where}: secrets must be a list of environment variable names")
    for key in ("name", "terms", "notes"):
        if raw.get(key) is not None and not isinstance(raw[key], str):
            raise ConfigError(f"{where}: {key} must be a string")
    return FeedConfig(
        id=fid,
        kind=raw["kind"],
        url=url,
        cadence_minutes=cadence,
        lang=raw["lang"],
        enabled=raw["enabled"],
        queue=queue,
        name=raw.get("name"),
        country=country,
        source_id=source_id,
        regions=tuple(regions),
        secrets=tuple(secrets),
        terms=raw.get("terms"),
        notes=raw.get("notes"),
    )


def parse_feeds(document: Any, where: str = "config") -> list[FeedConfig]:
    if (
        not isinstance(document, dict)
        or set(document) != {"feeds"}
        or not isinstance(document["feeds"], list)
    ):
        raise ConfigError(f"{where}: top level must be a mapping with a single 'feeds' list")
    feeds = [_feed(raw, f"{where}: feeds[{i}]") for i, raw in enumerate(document["feeds"])]
    seen: set[str] = set()
    for f in feeds:
        if f.id in seen:
            raise ConfigError(f"{where}: duplicate feed id {f.id!r}")
        seen.add(f.id)
    return feeds


def load_feeds(path: str | Path) -> list[FeedConfig]:
    path = Path(path)
    with path.open(encoding="utf-8") as fh:
        document = yaml.safe_load(fh)
    return parse_feeds(document, str(path))
