#!/usr/bin/env python3
"""How much activity is announced at sea in our region, counted year by year.

A navigational warning is a state telling every ship where not to go and when: a firing exercise, a
missile test, submarine operations, a survey ship's run. Counting them is the one measure of
military activity at sea that needs no inference, because the state doing it published the notice
itself — and the whole archive of those notices is a work of the United States Government, in the
public domain, served as JSON by the NGA Maritime Safety Information site.

    https://msi.nga.mil/api/publications/broadcast-warn?status=cancelled&output=json   (the archive)
    https://msi.nga.mil/api/publications/broadcast-warn?status=active&output=json      (in force)

This builder reads both, keeps what falls in our region, classifies each warning by what its
wording names (`gt_collectors.navtex.activity_of`), and writes a yearly series:

    apps/web/assets/data/msi-activity.json

**What is deliberately left out.** Warnings issued by Turkish authorities are not counted and not
published here. The series measures what *other* states announce; publishing a series of Türkiye's
own announced firing and exercise areas is the thing ADR 0013 forbids, whoever published the notice
first. The file records how many were dropped for that reason, so the omission is visible rather
than silent.

**What a count is and is not.** One warning is one announcement, not one exercise, not one ship and
not one day: a long exercise may be announced once or amended five times, and an archive that ends
where the service's own snapshot ends is a floor, never a total. Worse, a change in the total can
be a change in what the archive carries rather than in what happens at sea — NGA's relay of the
Mediterranean warnings largely stops after 2021 — so every year also carries how many warnings the
same archive holds for *all* sea areas, and which authorities issued the regional ones. Read the
series against those two columns or not at all.

    python tools/msi/build_activity.py [--cache DIR] [--refresh]

The downloads are cached outside the repository, like the other builders here. Dependencies: none
beyond the standard library and `gt_collectors` (collectors/src on the path).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "apps" / "web" / "assets" / "data" / "msi-activity.json"
sys.path.insert(0, str(ROOT / "collectors" / "src"))

# the path is set above, so this import cannot move to the top of the file
from gt_collectors import navtex

API = "https://msi.nga.mil/api/publications/broadcast-warn?status={status}&output=json"
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

# The region this project watches, as the warnings themselves name it. A warning is kept when its
# text names one of these waters, or when any position it carries falls inside BBOX.
REGION_WORDS = (
    "AEGEAN SEA", "EASTERN MEDITERRANEAN", "CENTRAL MEDITERRANEAN", "BLACK SEA", "SEA OF MARMARA",
    "DARDANELLES", "BOSPORUS", "BOSPHORUS", "LEVANTINE", "CYPRUS", "CRETE", "RHODES", "IONIAN SEA",
)
BBOX = (19.0, 30.0, 42.0, 47.0)  # west, south, east, north — Ionian to the Caucasus, Libya to Ukraine

# Authorities we do not count (see the module docstring). Matched against the `authority` field and
# the first line of the text, upper-cased.
TURKISH_AUTHORITY = re.compile(
    r"\bTURK(EY|ISH)\b|\bTURKIYE\b|ANTALYA (RADIO|NAVTEX)|IZMIR (RADIO|NAVTEX)|ISTANBUL (RADIO|NAVTEX)|"
    r"SAMSUN (RADIO|NAVTEX)|TURKISH (NAVY|STRAITS)"
)
# A warning about a Turkish area issued by someone else is still about Turkish forces if it says so.
TURKISH_SUBJECT = re.compile(r"^\s*[A-Z ]*\bTURKEY\b")


def fetch(status: str, cache: Path, refresh: bool) -> list[dict]:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"msi-{status}.json"
    if refresh or not path.exists():
        print(f"fetching {status} warnings", file=sys.stderr)
        req = urllib.request.Request(API.format(status=status), headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=900) as r, path.open("wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    return json.loads(path.read_text(encoding="utf-8"))["broadcast-warn"]


def in_region(text: str, positions: list) -> bool:
    upper = text.upper()
    if any(w in upper for w in REGION_WORDS):
        return True
    west, south, east, north = BBOX
    return any(west <= p.lon <= east and south <= p.lat <= north for p in positions)


def is_turkish(item: dict, text: str) -> bool:
    upper = f"{item.get('authority') or ''} {text[:120]}".upper()
    return bool(TURKISH_AUTHORITY.search(upper) or TURKISH_SUBJECT.search(text.upper()))


def build(cache: Path, refresh: bool) -> dict:
    items = fetch("cancelled", cache, refresh) + fetch("active", cache, refresh)
    years: Counter[int] = Counter()
    archive_years: Counter[int] = Counter()  # every warning in the archive, all areas: the exposure baseline
    per_year: dict[int, Counter[str]] = defaultdict(Counter)
    per_year_auth: dict[int, Counter[str]] = defaultdict(Counter)
    authorities: Counter[str] = Counter()
    dropped_tur = 0
    cancellations = 0
    kept = 0
    seen: set[tuple] = set()

    for item in items:
        text = item.get("text") or ""
        if not text:
            continue
        key = (item.get("msgYear"), item.get("msgNumber"), item.get("navArea"))
        if key in seen:
            continue
        seen.add(key)
        if isinstance(item.get("msgYear"), int):
            archive_years[item["msgYear"]] += 1
        positions = navtex.positions(text)
        if not in_region(text, positions):
            continue
        if is_turkish(item, text):
            dropped_tur += 1
            continue
        year = item.get("msgYear")
        if not isinstance(year, int):
            continue
        if navtex.is_cancellation_only(text):
            cancellations += 1
            continue
        activity = navtex.activity_of(text) or "unclassified"
        years[year] += 1
        per_year[year][activity] += 1
        auth_words = (item.get("authority") or "").split()
        auth = auth_words[0].rstrip(".,") if auth_words else "unknown"
        authorities[auth] += 1
        per_year_auth[year][auth] += 1
        kept += 1

    series = [
        {
            "year": y,
            "total": years[y],
            "by_activity": dict(sorted(per_year[y].items())),
            # who was relaying that year, and how concentrated it was: this is what tells a reader
            # whether a change in the total is a change in activity or a change in the archive
            "by_authority": dict(per_year_auth[y].most_common(6)),
            "authorities": len(per_year_auth[y]),
            # the same archive, all sea areas: a year's regional count only means something next to it
            "archive_all_areas": archive_years[y],
        }
        for y in sorted(years)
    ]
    return {
        "about": (
            "Navigational warnings for the Aegean, the eastern Mediterranean and the Black Sea, counted "
            "by year and by what the wording names. One warning is one announcement — not one exercise, "
            "not one ship, not one day — and the archive is a floor, not a total."
        ),
        "source": {
            "name": "NGA Maritime Safety Information — broadcast warnings",
            "url": "https://msi.nga.mil/NavWarnings",
            "licence": "Work of the United States Government: public domain",
        },
        "method": {
            "region": {"words": list(REGION_WORDS), "bbox": list(BBOX)},
            "classified_by": "gt_collectors.navtex.activity_of (the words the warning itself uses)",
            "excluded": (
                "Warnings issued by Turkish authorities, or whose subject is Türkiye, are not counted: "
                "this series measures what other states announce (ADR 0013, ADR 0019)."
            ),
        },
        "built_from": {
            "records_read": len(items),
            "records_kept": kept,
            "turkish_warnings_excluded": dropped_tur,
            "cancellation_only_messages_skipped": cancellations,
            "years": [series[0]["year"], series[-1]["year"]] if series else [],
        },
        "coverage_notes": [
            {
                "years": "1990-2021",
                "note": (
                    "The NGA archive relays NAVAREA III and the Greek NAVTEX stations for this region. "
                    "The totals in these years are dominated by those relays."
                ),
            },
            {
                "years": "2022-",
                "note": (
                    "The relay largely stops: in 2020 the region's warnings were 1,148 NAVAREA III relays, "
                    "in 2022 they are 76, and by 2023 most of what remains is issued by Romania and the "
                    "rescue coordination centres. The fall in the totals after 2021 is a change in what "
                    "the archive carries, not a measured fall in activity, and a reader must not read it "
                    "as one. The per-year `by_authority` breakdown is here so that change is visible."
                ),
            },
        ],
        "top_authorities": dict(authorities.most_common(12)),
        "series": series,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache", default=os.environ.get("GT_MSI_CACHE", Path(tempfile.gettempdir()) / "gt-msi-cache"))
    ap.add_argument("--refresh", action="store_true", help="download again instead of using the cache")
    args = ap.parse_args()
    data = build(Path(args.cache), args.refresh)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    b = data["built_from"]
    print(
        f"{b['records_kept']} warnings in region ({b['records_read']} read, "
        f"{b['turkish_warnings_excluded']} Turkish excluded), {b['years']} -> {OUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
