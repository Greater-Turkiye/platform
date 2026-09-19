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
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "apps" / "web" / "assets" / "data" / "msi-activity.json"
sys.path.insert(0, str(ROOT / "collectors" / "src"))

# the path is set above, so these imports cannot move to the top of the file
from gt_collectors import msi

API = "https://msi.nga.mil/api/publications/broadcast-warn?status={status}&output=json"
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

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


def build(cache: Path, refresh: bool) -> dict:
    items = fetch("cancelled", cache, refresh) + fetch("active", cache, refresh)
    tally = msi.summarise(items)
    series = tally.series()
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
            "region": {"words": list(msi.REGION_WORDS), "bbox": list(msi.BBOX)},
            "classified_by": "gt_collectors.navtex.activity_of (the words the warning itself uses)",
            "counted_by": "gt_collectors.msi.summarise",
            "excluded": (
                "Warnings issued by Turkish authorities, or whose subject is Türkiye, are not counted: "
                "this series measures what other states announce (ADR 0013, ADR 0019)."
            ),
        },
        "built_from": {
            "records_read": tally.read,
            "records_kept": tally.kept,
            "turkish_warnings_excluded": tally.turkish_excluded,
            "cancellation_only_messages_skipped": tally.cancellations,
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
                    "The relay largely stops: 946 of the region's 1,034 warnings in 2020 were NAVAREA III "
                    "relays, against 66 in 2022, and by 2023 most of what remains is issued by Romania and "
                    "the rescue coordination centres. The fall in the totals after 2021 is a change in what "
                    "the archive carries, not a measured fall in activity, and a reader must not read it as "
                    "one. The per-year `by_authority` breakdown is here so that change is visible."
                ),
            },
        ],
        "top_authorities": dict(tally.authorities.most_common(12)),
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
