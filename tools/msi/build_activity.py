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
wording names (`gt_collectors.navtex.activity_of`), and writes two files:

    apps/web/assets/data/msi-activity.json   the yearly series
    apps/web/assets/data/msi-density.json    where those warnings were announced, on a 0.25° grid

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

The downloads are cached outside the repository, like the other builders here. Dependencies: the
standard library, `gt_collectors` (collectors/src on the path) and — for the density grid only —
`shapely`, which drops grid cells whose centre falls on land so the map shows sea activity.
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
OUT_DENSITY = ROOT / "apps" / "web" / "assets" / "data" / "msi-density.json"
OUT_REGIONS = ROOT / "apps" / "web" / "assets" / "data" / "msi-regions.json"

# The watch regions, as `GT.REGIONS` in assets/js/gt.js defines them: [[west, south], [east, north]].
# They are repeated here rather than imported because the panel's regions are a product decision that
# belongs in one place per language; if one moves, this list moves with it (the builder asserts the
# count so a region added there and forgotten here is caught).
REGION_BBOX = {
    "syria": ((35.5, 32.3), (42.4, 37.4)),
    "iraq": ((38.8, 29.0), (48.6, 37.4)),
    "iran": ((44.0, 25.0), (63.4, 39.8)),
    "levant": ((34.2, 29.2), (39.3, 34.7)),
    "caucasus": ((39.9, 38.3), (50.5, 43.7)),
    "aegean": ((22.5, 35.0), (28.5, 41.0)),
    "east-med": ((27.0, 31.0), (36.5, 37.0)),
    "cyprus": ((32.2, 34.5), (34.7, 35.8)),
    "black-sea": ((27.4, 40.8), (41.8, 47.3)),
    "libya-north-africa": ((-9.0, 19.5), (37.0, 37.5)),
    "gulf-red-sea": ((32.0, 10.0), (60.0, 30.5)),
    "balkans": ((13.4, 39.6), (29.8, 48.3)),
    "central-asia": ((46.5, 35.0), (87.0, 55.5)),
}
# `global` is deliberately absent: it is not a place, and a region with no box reads as "—" in the
# panel rather than as a zero, which is the honest answer for water nobody counted.
# The window the density map is drawn from: the years when the archive's coverage of this region is
# steady. Mixing in a year when NAVAREA III was not relayed would map the archive, not the sea.
DENSITY_YEARS = (2015, 2021)
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


def land_of(world: Path):
    """The land the site draws (countries-50m.json), as one shapely geometry."""
    # imported here: only the density grid needs shapely, and the yearly series must build without it
    import shapely
    from shapely.geometry import shape
    from shapely.ops import unary_union

    topo = json.loads(world.read_text(encoding="utf-8"))
    t = topo["transform"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * t["scale"][0] + t["translate"][0], y * t["scale"][1] + t["translate"][1]))
        arcs.append(pts)

    def ring(idxs):
        out: list[tuple[float, float]] = []
        for i in idxs:
            a = arcs[~i][::-1] if i < 0 else arcs[i]
            out.extend(a if not out else a[1:])
        return out

    geoms = []
    for g in topo["objects"]["countries"]["geometries"]:
        if g["type"] == "Polygon":
            geoms.append(shape({"type": "Polygon", "coordinates": [ring(r) for r in g["arcs"]]}))
        elif g["type"] == "MultiPolygon":
            geoms.append(shape({"type": "MultiPolygon", "coordinates": [[ring(r) for r in p] for p in g["arcs"]]}))
    return shapely.prepare(unary_union([g.buffer(0) for g in geoms])) or unary_union([g.buffer(0) for g in geoms])


def build_density(cache: Path, refresh: bool) -> dict:
    """Where the warnings were announced, on a coarse grid — a picture of years, not of anything now."""
    # see land_of: shapely is a dependency of the density grid only
    from shapely.geometry import Point

    items = fetch("cancelled", cache, refresh) + fetch("active", cache, refresh)
    grid = msi.density(items, DENSITY_YEARS)
    # A warning's bounding box can reach over a coast; a cell whose centre is on land is dropped,
    # because this is a map of activity at sea and a red square over a Greek village is not that.
    land = land_of(ROOT / "apps" / "web" / "assets" / "data" / "countries-50m.json")
    half = msi.CELL_DEG / 2
    on_land = [c for c in grid if land.contains(Point(c[0] + half, c[1] + half))]
    for c in on_land:
        del grid[c]
    cells = [
        [lon, lat, c.get("military", 0), c.get("survey", 0), c.get("other", 0)]
        for (lon, lat), c in sorted(grid.items())
    ]
    totals = {k: sum(c[i + 2] for c in cells) for i, k in enumerate(("military", "survey", "other"))}
    return {
        "about": (
            "Where navigational warnings were announced in our waters between "
            f"{DENSITY_YEARS[0]} and {DENSITY_YEARS[1]}, counted on a {msi.CELL_DEG}° grid. A cell counts a "
            "warning when the warning's area covers it; a notice spanning more than "
            f"{msi.MAX_SPAN_DEG2}° square is region-wide and is not drawn as an area at all."
        ),
        "source": {
            "name": "NGA Maritime Safety Information — broadcast warnings",
            "url": "https://msi.nga.mil/NavWarnings",
            "licence": "Work of the United States Government: public domain",
        },
        "method": {
            "cell_deg": msi.CELL_DEG,
            "window": list(DENSITY_YEARS),
            "window_reason": (
                "The archive's coverage of this region is steady in these years; NGA's relay of "
                "NAVAREA III and the Greek NAVTEX stations largely stops after 2021."
            ),
            "kinds": ["military", "survey", "other"],
            "excluded": (
                "Warnings issued by Turkish authorities, or whose subject is Türkiye, are not counted "
                "(ADR 0013). Nothing here is current: the window ends in 2021."
            ),
        },
        "totals": totals,
        "cells_dropped_on_land": len(on_land),
        "cells": cells,
    }


def build_regions(grid_file: dict) -> dict:
    """Each watch region's share of the announced activity, from the same grid the map draws.

    A cell counts for a region when its centre is inside that region's box. Boxes overlap — the
    Eastern Mediterranean and Cyprus share water — so the shares do not sum to the total, and the
    file says so rather than hiding it behind a normalisation nobody asked for."""
    half = msi.CELL_DEG / 2
    out = {}
    for code, ((west, south), (east, north)) in REGION_BBOX.items():
        mil = survey = other = cells = 0
        for lon, lat, m, s_, o in grid_file["cells"]:
            x, y = lon + half, lat + half
            if west <= x <= east and south <= y <= north:
                mil += m
                survey += s_
                other += o
                cells += 1
        out[code] = {"military": mil, "survey": survey, "other": other, "cells": cells}
    return {
        "about": (
            "Announced activity per watch region, counted from the same grid the map draws "
            f"({grid_file['method']['window'][0]}-{grid_file['method']['window'][1]}). A cell counts for a "
            "region when its centre is inside that region's box; the boxes overlap, so the regions do not "
            "sum to the total. Turkish warnings are not counted (ADR 0013)."
        ),
        "source": grid_file["source"],
        "window": grid_file["method"]["window"],
        "regions": out,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache", default=os.environ.get("GT_MSI_CACHE", Path(tempfile.gettempdir()) / "gt-msi-cache"))
    ap.add_argument("--refresh", action="store_true", help="download again instead of using the cache")
    args = ap.parse_args()
    cache = Path(args.cache)
    data = build(cache, args.refresh)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    b = data["built_from"]
    print(
        f"{b['records_kept']} warnings in region ({b['records_read']} read, "
        f"{b['turkish_warnings_excluded']} Turkish excluded), {b['years']} -> {OUT.relative_to(ROOT)}"
    )
    grid = build_density(cache, False)  # the same cache; never a second download
    OUT_DENSITY.write_text(
        json.dumps(grid, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(
        f"{len(grid['cells'])} cells, {grid['totals']} in {grid['method']['window']} "
        f"-> {OUT_DENSITY.relative_to(ROOT)}"
    )
    regions = build_regions(grid)
    OUT_REGIONS.write_text(
        json.dumps(regions, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    top = sorted(regions["regions"].items(), key=lambda kv: -kv[1]["military"])[:3]
    print(
        f"{len(regions['regions'])} regions -> {OUT_REGIONS.relative_to(ROOT)}; "
        + ", ".join(f"{k} {v['military']}" for k, v in top)
    )


if __name__ == "__main__":
    main()
