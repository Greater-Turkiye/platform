"""Relevance filter: does a candidate concern Türkiye's external security environment?

**This is a noise filter, nothing else.** The Turkish-forces safety filter (:mod:`gt_collectors.safety`)
and the geofence (:mod:`gt_collectors.geo`) run first, in memory, and are not configurable from
here: no table in ``data/relevance.yaml`` can let through anything they drop, and no score keeps
anything out of their way. Relevance only decides whether a human is asked to look at an item.

The first real run (platform issue #41) put ten items in front of a reviewer, of which most were
UN world news with no bearing on the watch regions (Haiti, South Sudan, El Niño), and every item
was labelled ``global``. This module answers two questions per item:

**Which watch region is this about?**
    Country, capital and major-place names, adjectives and demonyms, in Turkish and English, per
    region code from ``datasets/vocab/regions.yaml`` (which stays the canonical list). Each
    distinct phrase found counts once, at the table's ``weights.title`` when it appears in the
    title and ``weights.text`` when only in the excerpt; the sum is capped at 1. When the text
    names no region at all, the feed's own region (``geo.region``) stands in at the lower
    ``weights.feed_region``. ``global`` is not matchable: it is what is left when nothing fits.

**Is this the kind of event the project records?**
    Keyword groups keyed by ``datasets/vocab/event-types.yaml`` codes — military activity,
    deployments, exercises, procurement, airspace and maritime incidents, basing, sanctions on
    defence trade. Every group that matches contributes once, capped at 1.

    ``score = weights.region * region_score + weights.topic * topic_score``, and **zero if either
    signal is zero**: a watch-region country with no security event is a human-interest story
    ("Child brides of Yemen"), and a security event with no watch region is somebody else's
    neighbourhood ("Haiti sanctions committee"). Both are noise here.

Three outcomes, from ``threshold`` and ``margin`` in the table:

``score >= threshold``
    queued.
``threshold - margin <= score < threshold``
    queued **and marked** ``borderline``. A near miss is more often a gap in the tables than a
    genuinely irrelevant item, so the filter says "I am not sure" instead of dropping it quietly.
``score < threshold - margin``
    not queued. The item still goes into the run artifact with ``status: off-topic`` and is
    counted in the issue, and it is **not** written to the dedup ledger, so a better table picks
    it up on the next run.

Matching folds Unicode (NFKC, casefold, combining marks removed, ``ı``/``ə`` mapped), so
``İran``/``IRAN``/``iran`` are one term, and respects word boundaries. A trailing ``*`` makes an
entry a prefix match (``konuşlan*`` → ``konuşlandırıldı``), which is how Turkish suffixes are
handled without a stemmer.
"""

from __future__ import annotations

import copy
import re
import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from functools import cache
from importlib import resources
from pathlib import Path
from typing import Any

import yaml

from gt_collectors.normalize import normalize_text
from gt_collectors.signal import CODE_RE, Signal

SCHEMA = "gt-relevance/1"
DATA_FILE = "data/relevance.yaml"
WEIGHT_KEYS = ("region", "topic", "title", "text", "feed_region")
TOP_LEVEL_KEYS = frozenset({"schema", "threshold", "margin", "weights", "exclude", "regions", "topics"})
# The fallback region code; never matchable, so it cannot be a relevance signal.
GLOBAL = "global"
EPSILON = 1e-9

_TRANSLITERATE = str.maketrans({"ı": "i", "ə": "e", "ß": "ss"})


class RelevanceError(ValueError):
    pass


def fold(text: str | None) -> str:
    """Case- and diacritic-insensitive form used for both the tables and the item text.

    NFKC, casefold, drop combining marks (so ``İ`` → ``i``, ``ş`` → ``s``, ``ü`` → ``u``), then
    map the base letters that carry no combining mark (``ı`` → ``i``, ``ə`` → ``e``). Turkish and
    English spellings of the same name therefore land on the same key.
    """
    if not text:
        return ""
    folded = unicodedata.normalize("NFKC", normalize_text(text)).casefold()
    stripped = "".join(c for c in unicodedata.normalize("NFD", folded) if not unicodedata.combining(c))
    return unicodedata.normalize("NFC", stripped.translate(_TRANSLITERATE))


def _pattern(term: str) -> str:
    """One table entry as a regex fragment; a trailing ``*`` is a prefix match."""
    if term.endswith("*"):
        return re.escape(term[:-1]) + r"\w*"
    return re.escape(term) + r"(?!\w)"


def _compile(terms: Iterable[str]) -> re.Pattern[str]:
    # Longest first, so "south ossetia" wins over "ossetia" and a phrase is never split.
    ordered = sorted({fold(t) for t in terms if fold(t)}, key=len, reverse=True)
    if not ordered:
        raise RelevanceError("a term list cannot be empty")
    return re.compile(r"(?<!\w)(?:" + "|".join(_pattern(t) for t in ordered) + ")")


@dataclass(frozen=True, slots=True)
class Relevance:
    """What the filter decided about one item, and why."""

    score: float
    region: str | None
    region_score: float
    topic_score: float
    topics: tuple[str, ...]
    terms: tuple[str, ...]
    threshold: float
    margin: float

    @property
    def cut(self) -> float:
        """The score an item must reach to enter the queue at all."""
        return self.threshold - self.margin

    @property
    def relevant(self) -> bool:
        return self.score + EPSILON >= self.cut

    @property
    def borderline(self) -> bool:
        """Queued, but below the threshold: the reviewer is told the filter was unsure."""
        return self.relevant and self.score + EPSILON < self.threshold

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "region": self.region,
            "region_score": self.region_score,
            "topic_score": self.topic_score,
            "topics": list(self.topics),
            "terms": list(self.terms),
            "threshold": self.threshold,
            "borderline": self.borderline,
        }


class Table:
    """The compiled region and topic tables from ``data/relevance.yaml``."""

    def __init__(
        self,
        *,
        regions: Mapping[str, Iterable[str]],
        topics: Mapping[str, Iterable[str]],
        weights: Mapping[str, float],
        threshold: float,
        margin: float,
        exclude: Iterable[str] = (),
    ) -> None:
        missing = [k for k in WEIGHT_KEYS if k not in weights]
        if missing:
            raise RelevanceError(f"weights are missing {missing}")
        for key in WEIGHT_KEYS:
            value = weights[key]
            if isinstance(value, bool) or not isinstance(value, int | float) or not 0 < value <= 1:
                raise RelevanceError(f"weights.{key} must be a number in (0, 1]")
        for name, value in (("threshold", threshold), ("margin", margin)):
            if isinstance(value, bool) or not isinstance(value, int | float) or not 0 <= value <= 1:
                raise RelevanceError(f"{name} must be a number in [0, 1]")
        if margin > threshold:
            raise RelevanceError("margin cannot be larger than threshold")
        if not regions or not topics:
            raise RelevanceError("the table needs at least one region and one topic group")
        if GLOBAL in regions:
            raise RelevanceError(f"{GLOBAL!r} is the fallback region and must not be matchable")
        for code in (*regions, *topics):
            if not isinstance(code, str) or not CODE_RE.match(code.split(".", 1)[0]):
                raise RelevanceError(f"{code!r} is not a vocabulary code")

        self.threshold = float(threshold)
        self.margin = float(margin)
        self.weights = {k: float(weights[k]) for k in WEIGHT_KEYS}
        # Order matters: the first region listed wins a tie.
        self.region_codes = tuple(regions)
        self._regions = {code: _compile(terms) for code, terms in regions.items()}
        self._topics = {code: _compile(terms) for code, terms in topics.items()}
        self._exclude = _compile(exclude) if list(exclude) else None

    # -- scoring ---------------------------------------------------------------------------

    def _region_hits(self, title: str, text: str) -> dict[str, tuple[float, tuple[str, ...]]]:
        scores: dict[str, tuple[float, tuple[str, ...]]] = {}
        for code in self.region_codes:
            pattern = self._regions[code]
            in_title = {m.group(0) for m in pattern.finditer(title)}
            in_text = {m.group(0) for m in pattern.finditer(text)}
            found = in_title | in_text
            if not found:
                continue
            total = sum(self.weights["title"] if t in in_title else self.weights["text"] for t in found)
            scores[code] = (min(1.0, total), tuple(sorted(found)))
        return scores

    def _topic_hits(self, title: str, text: str) -> tuple[float, tuple[str, ...]]:
        total = 0.0
        matched: list[str] = []
        for code, pattern in self._topics.items():
            if pattern.search(title):
                total += self.weights["title"]
            elif pattern.search(text):
                total += self.weights["text"]
            else:
                continue
            matched.append(code)
        return min(1.0, total), tuple(matched)

    def assess(self, signal: Signal) -> Relevance:
        """Score one signal. Never reads or reveals anything the safety filter already dropped."""
        title = fold(signal.title)
        text = fold(signal.text)
        if self._exclude is not None:
            # Blank out false friends ("South Sudan" is not Sudan) before region matching only.
            region_title = self._exclude.sub(" ", title)
            region_text = self._exclude.sub(" ", text)
        else:
            region_title, region_text = title, text

        hits = self._region_hits(region_title, region_text)
        prior = signal.geo.region if signal.geo.region in self._regions else None
        if hits:
            # Highest score wins; ties go to the region listed first in the table.
            region = max(hits, key=lambda code: (hits[code][0], -self.region_codes.index(code)))
            region_score, terms = hits[region]
            if prior == region:
                region_score = max(region_score, self.weights["feed_region"])
        elif prior is not None:
            region, region_score, terms = prior, self.weights["feed_region"], ()
        else:
            region, region_score, terms = None, 0.0, ()

        topic_score, topics = self._topic_hits(title, text)
        if region_score <= 0.0 or topic_score <= 0.0:
            score = 0.0
        else:
            score = self.weights["region"] * region_score + self.weights["topic"] * topic_score
        return Relevance(
            score=round(score, 3),
            region=region,
            region_score=round(region_score, 3),
            topic_score=round(topic_score, 3),
            topics=topics,
            terms=terms,
            threshold=self.threshold,
            margin=self.margin,
        )

    def with_threshold(self, threshold: float) -> Table:
        """The same tables with a different threshold (``gt-collect --min-relevance``)."""
        if isinstance(threshold, bool) or not isinstance(threshold, int | float) or not 0 <= threshold <= 1:
            raise RelevanceError("threshold must be a number in [0, 1]")
        clone = copy.copy(self)
        clone.threshold = float(threshold)
        clone.margin = min(self.margin, float(threshold))
        return clone

    # -- loading ---------------------------------------------------------------------------

    @classmethod
    def from_mapping(cls, document: Any, *, where: str = "relevance table") -> Table:
        if not isinstance(document, dict):
            raise RelevanceError(f"{where}: the table must be a mapping")
        unknown = set(document) - TOP_LEVEL_KEYS
        if unknown:
            raise RelevanceError(f"{where}: unknown keys {sorted(unknown)}")
        if document.get("schema") != SCHEMA:
            raise RelevanceError(f"{where}: schema must be {SCHEMA!r}")
        for key in ("weights", "regions", "topics"):
            if not isinstance(document.get(key), dict):
                raise RelevanceError(f"{where}: {key} must be a mapping")
        for key in ("regions", "topics"):
            for code, terms in document[key].items():
                if not isinstance(terms, list) or not all(isinstance(t, str) and t.strip() for t in terms):
                    raise RelevanceError(f"{where}: {key}.{code} must be a list of non-empty strings")
        exclude = document.get("exclude") or []
        if not isinstance(exclude, list) or not all(isinstance(t, str) for t in exclude):
            raise RelevanceError(f"{where}: exclude must be a list of strings")
        try:
            return cls(
                regions=document["regions"],
                topics=document["topics"],
                weights=document["weights"],
                threshold=document["threshold"],
                margin=document["margin"],
                exclude=exclude,
            )
        except KeyError as exc:
            raise RelevanceError(f"{where}: missing key {exc.args[0]!r}") from None
        except RelevanceError as exc:
            raise RelevanceError(f"{where}: {exc}") from None

    @classmethod
    def load(cls, path: str | Path | None = None) -> Table:
        """Load the packaged table, or an alternative file (``gt-collect --relevance PATH``)."""
        if path is None:
            text = resources.files("gt_collectors").joinpath(DATA_FILE).read_text(encoding="utf-8")
            where = DATA_FILE
        else:
            text = Path(path).read_text(encoding="utf-8")
            where = str(path)
        return cls.from_mapping(yaml.safe_load(text), where=where)


@cache
def default_table() -> Table:
    """The packaged table, compiled once per process."""
    return Table.load()


def assess(signal: Signal, *, table: Table | None = None) -> Relevance:
    return (table or default_table()).assess(signal)
