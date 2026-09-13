"""Generic RSS 2.0 / RSS 1.0 (RDF) / Atom collector using only the standard library.

Why not ``feedparser``: it is large, pulls in ``sgmllib3k``, and we only need title, link,
summary and date. ``xml.etree`` with the hardening below is enough:

* documents that declare entities (``<!ENTITY``) are rejected outright — no entity expansion
  attacks (billion laughs, external entities) are possible;
* HTML named entities that some feeds use without declaring them (``&nbsp;``, ``&ldquo;``)
  are rewritten to numeric character references before parsing;
* the fetch helper caps response size (5 MiB).

Only a link, the title and a short excerpt are kept — full text is never copied.
"""

from __future__ import annotations

import html.entities
import re
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urljoin

from gt_collectors import fetch, safety
from gt_collectors.config import FeedConfig
from gt_collectors.normalize import InvalidURL, normalize_text, normalize_url, sha256_prefixed
from gt_collectors.signal import TITLE_MAX, Geo, Signal

EXCERPT_CHARS = 500
_XML_PREDEFINED = frozenset({"amp", "lt", "gt", "quot", "apos"})
_NAMED_ENTITY = re.compile(rb"&([A-Za-z][A-Za-z0-9]{1,31});")
_BLOCK_TAGS = frozenset({"p", "br", "div", "li", "ul", "ol", "tr", "td", "h1", "h2", "h3", "h4", "h5", "h6"})


class FeedError(ValueError):
    pass


def _local(tag: object) -> str:
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def _fix_entity(match: re.Match[bytes]) -> bytes:
    name = match.group(1).decode("ascii")
    if name in _XML_PREDEFINED or name not in html.entities.name2codepoint:
        return match.group(0)
    return f"&#{html.entities.name2codepoint[name]};".encode("ascii")


def parse_xml(data: bytes) -> ET.Element:
    data = data.lstrip(b"\xef\xbb\xbf\x00 \t\r\n")
    if b"<!ENTITY" in data:
        raise FeedError("feed declares XML entities; refusing to parse")
    data = _NAMED_ENTITY.sub(_fix_entity, data)
    try:
        return ET.fromstring(data)  # noqa: S314 - entity declarations rejected above
    except ET.ParseError as exc:
        raise FeedError(f"not well-formed XML: {exc}") from None


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: object) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._skip:
            self._skip -= 1
        elif tag in _BLOCK_TAGS:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def html_to_text(value: str | None) -> str:
    if not value:
        return ""
    parser = _TextExtractor()
    parser.feed(value)
    parser.close()
    return normalize_text("".join(parser.parts))


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip() + "…"


def parse_date(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    value = value.strip()
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).replace(microsecond=0)


@dataclass
class FeedItem:
    title: str
    link: str | None
    summary: str
    published: datetime | None
    raw: bytes


def _text_of(el: ET.Element) -> str:
    return "".join(el.itertext())


def _atom_link(entry: ET.Element) -> str | None:
    fallback = None
    for child in entry:
        if _local(child.tag) != "link" or not child.get("href"):
            continue
        rel = child.get("rel", "alternate")
        if rel == "alternate":
            return child.get("href")
        fallback = fallback or child.get("href")
    return fallback


def _item(el: ET.Element, atom: bool) -> FeedItem:
    fields: dict[str, ET.Element] = {}
    for child in el:
        fields.setdefault(_local(child.tag), child)

    def text(*names: str) -> str | None:
        for n in names:
            if n in fields:
                return _text_of(fields[n])
        return None

    if atom:
        link = _atom_link(el)
    else:
        link = text("link")
        if not (link and link.strip()) and "guid" in fields:
            guid = fields["guid"]
            if guid.get("isPermaLink", "true").lower() != "false":
                link = _text_of(guid)
    summary = text("description", "summary") or text("encoded", "content") or ""
    published = parse_date(text("pubdate", "published", "date", "issued", "updated", "modified"))
    return FeedItem(
        title=html_to_text(text("title")),
        link=link.strip() if link else None,
        summary=html_to_text(summary),
        published=published,
        raw=ET.tostring(el, encoding="utf-8"),
    )


def parse_feed(data: bytes) -> list[FeedItem]:
    root = parse_xml(data)
    kind = _local(root.tag)
    if kind == "rss":
        channel = next((c for c in root if _local(c.tag) == "channel"), None)
        if channel is None:
            raise FeedError("RSS document without <channel>")
        elements, atom = [c for c in channel if _local(c.tag) == "item"], False
    elif kind == "rdf":
        elements, atom = [c for c in root if _local(c.tag) == "item"], False
    elif kind == "feed":
        elements, atom = [c for c in root if _local(c.tag) == "entry"], True
    else:
        raise FeedError(f"not an RSS/Atom document (root <{kind}>)")
    return [_item(el, atom) for el in elements]


def item_to_signal(item: FeedItem, feed: FeedConfig, *, base_url: str, fetched_at: datetime) -> Signal | None:
    """Build a Signal, or ``None`` if the item has no usable http(s) link."""
    if not item.link:
        return None
    try:
        url = normalize_url(urljoin(base_url, item.link))
    except InvalidURL:
        return None
    published = item.published
    if published is not None and published > fetched_at + timedelta(days=1):
        published = None  # implausible future date
    region = feed.regions[0] if len(feed.regions) == 1 else None
    return Signal(
        source_id=feed.source_id,
        url=url,
        fetched_at=fetched_at,
        published_at=published,
        lang=feed.lang,
        title=truncate(item.title, TITLE_MAX),
        text=truncate(item.summary, EXCERPT_CHARS),
        raw_hash=sha256_prefixed(item.raw),
        geo=Geo(region=region, precision="region" if region else None),
    )


@dataclass
class CollectResult:
    feed_id: str
    signals: list[Signal] = field(default_factory=list)
    items: int = 0
    invalid: int = 0
    duplicates: int = 0
    dropped: int = 0
    by_reason: dict[str, int] = field(default_factory=dict)
    not_modified: bool = False
    etag: str | None = None
    last_modified: str | None = None

    def summary(self) -> dict[str, object]:
        return {
            "feed": self.feed_id,
            "items": self.items,
            "kept": len(self.signals),
            "invalid": self.invalid,
            "duplicates": self.duplicates,
            "dropped_by_safety_filter": self.dropped,
            "not_modified": self.not_modified,
        }


def collect(
    feed: FeedConfig,
    *,
    body: bytes | None = None,
    fetcher: Callable[..., fetch.FetchResult] = fetch.get,
    etag: str | None = None,
    last_modified: str | None = None,
    now: datetime | None = None,
) -> CollectResult:
    """Fetch (unless ``body`` is given), parse, normalize and safety-filter one feed."""
    fetched_at = (now or datetime.now(UTC)).astimezone(UTC).replace(microsecond=0)
    result = CollectResult(feed_id=feed.id)
    base_url = feed.url
    if body is None:
        response = fetcher(feed.url, etag=etag, last_modified=last_modified)
        result.etag, result.last_modified = response.etag, response.last_modified
        if response.not_modified:
            result.not_modified = True
            return result
        body, base_url = response.body, response.url or feed.url

    items = parse_feed(body)
    result.items = len(items)
    signals = []
    for item in items:
        signal = item_to_signal(item, feed, base_url=base_url, fetched_at=fetched_at)
        if signal is None:
            result.invalid += 1
        else:
            signals.append(signal)

    # Safety filter: in memory, right after parsing, before anything is written or sent.
    filtered = safety.filter_signals(signals)
    result.dropped = filtered.dropped
    result.by_reason = dict(filtered.by_reason)

    seen: set[str] = set()
    for signal in filtered.kept:
        key = signal.content_hash()
        if key in seen:
            result.duplicates += 1
            continue
        seen.add(key)
        result.signals.append(signal)
    return result
