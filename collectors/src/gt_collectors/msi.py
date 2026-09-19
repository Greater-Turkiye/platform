"""The rules for counting NGA broadcast warnings: which ones are ours, and which we never count.

The builder that writes `apps/web/assets/data/msi-activity.json` (tools/msi/build_activity.py) does
the downloading and the writing; everything that decides *what a number means* lives here, where it
can be tested. Two of these rules are load-bearing:

* :func:`in_region` — a warning is ours when its text names one of our waters, or when a position it
  carries falls inside the region. Names alone would miss a warning that only gives coordinates;
  coordinates alone would miss one that names the Aegean and describes an area in words.
* :func:`is_turkish` — a warning issued by Turkish authorities, or whose subject is Türkiye, is
  never counted. Publishing a series of Türkiye's own announced firing and exercise areas is what
  ADR 0013 forbids, whoever announced them first. A regression here would publish exactly what the
  red line exists to prevent, which is why it is tested rather than trusted.

The counting itself (:func:`summarise`) keeps three things next to every year's total: what the
wording named, who issued the warnings, and how many warnings the same archive holds for *all* sea
areas that year. Without that last column a rise or fall cannot be told apart from a change in what
the archive carries — and in this archive the Mediterranean relay stops after 2021.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from gt_collectors import navtex

# The region this project watches, as the warnings themselves name it.
REGION_WORDS: tuple[str, ...] = (
    "AEGEAN SEA", "EASTERN MEDITERRANEAN", "CENTRAL MEDITERRANEAN", "BLACK SEA", "SEA OF MARMARA",
    "DARDANELLES", "BOSPORUS", "BOSPHORUS", "LEVANTINE", "CYPRUS", "CRETE", "RHODES", "IONIAN SEA",
)
BBOX = (19.0, 30.0, 42.0, 47.0)  # west, south, east, north — Ionian to the Caucasus, Libya to Ukraine

TURKISH_AUTHORITY = re.compile(
    r"\bTURK(EY|ISH)\b|\bTURKIYE\b|ANTALYA (RADIO|NAVTEX)|IZMIR (RADIO|NAVTEX)|ISTANBUL (RADIO|NAVTEX)|"
    r"SAMSUN (RADIO|NAVTEX)|TURKISH (NAVY|STRAITS)"
)
# A warning about a Turkish area issued by somebody else still names Türkiye in its first line.
TURKISH_SUBJECT = re.compile(r"^\s*[A-Z ]*\bTURKEY\b")


@dataclass
class Tally:
    """What a run of :func:`summarise` counted."""

    years: Counter[int] = field(default_factory=Counter)
    per_year_activity: dict[int, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    per_year_authority: dict[int, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    archive_years: Counter[int] = field(default_factory=Counter)
    authorities: Counter[str] = field(default_factory=Counter)
    read: int = 0
    kept: int = 0
    turkish_excluded: int = 0
    cancellations: int = 0

    def series(self) -> list[dict]:
        return [
            {
                "year": y,
                "total": self.years[y],
                "by_activity": dict(sorted(self.per_year_activity[y].items())),
                "by_authority": dict(self.per_year_authority[y].most_common(6)),
                "authorities": len(self.per_year_authority[y]),
                "archive_all_areas": self.archive_years[y],
            }
            for y in sorted(self.years)
        ]


def in_region(text: str, positions=None) -> bool:
    """True when the warning names one of our waters, or carries a position inside the region."""
    if any(w in text.upper() for w in REGION_WORDS):
        return True
    west, south, east, north = BBOX
    return any(west <= p.lon <= east and south <= p.lat <= north for p in (positions or []))


def is_turkish(item: dict, text: str) -> bool:
    """True for a warning issued by Turkish authorities or whose subject is Türkiye — never counted."""
    head = f"{item.get('authority') or ''} {text[:120]}".upper()
    return bool(TURKISH_AUTHORITY.search(head) or TURKISH_SUBJECT.search(text.upper()))


def authority_of(item: dict) -> str:
    words = (item.get("authority") or "").split()
    return words[0].rstrip(".,") if words else "unknown"


def summarise(items) -> Tally:
    """Count the warnings that are ours, year by year. `items` are NGA broadcast-warning records."""
    t = Tally()
    seen: set[tuple] = set()
    for item in items:
        t.read += 1
        text = item.get("text") or ""
        if not text:
            continue
        key = (item.get("msgYear"), item.get("msgNumber"), item.get("navArea"))
        if key in seen:
            continue
        seen.add(key)
        year = item.get("msgYear")
        if isinstance(year, int):
            t.archive_years[year] += 1
        if not in_region(text, navtex.positions(text)):
            continue
        if is_turkish(item, text):
            t.turkish_excluded += 1
            continue
        if not isinstance(year, int):
            continue
        if navtex.is_cancellation_only(text):
            t.cancellations += 1
            continue
        activity = navtex.activity_of(text) or "unclassified"
        t.years[year] += 1
        t.per_year_activity[year][activity] += 1
        auth = authority_of(item)
        t.per_year_authority[year][auth] += 1
        t.authorities[auth] += 1
        t.kept += 1
    return t
