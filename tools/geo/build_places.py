"""Build apps/web/assets/data/places-10m.geojson: the cities the dashboard draws when it is zoomed in.

Source: Natural Earth 1:10m populated places (public domain). Natural Earth carries no Turkish names,
so the Turkish spelling of every place we care about comes from `place_names_tr.csv` in this folder —
our own table, reviewed by us, rather than a third party's idea of what a place is called.

The output keeps only what a regional dashboard can show: places inside the panel's view, filtered by
capital status, population and Natural Earth's own scale rank. Coordinates are rounded to three
decimals (about 100 m), which is far finer than a city dot needs.

    python build_places.py            # rebuild (uses the cached download if it is there)
    python build_places.py --refresh  # fetch the source again

The download is cached outside the repository, like the other builders here.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson"
HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "apps" / "web" / "assets" / "data" / "places-10m.geojson"
NAMES = HERE / "place_names_tr.csv"
CACHE = Path(os.environ.get("GT_CACHE", Path(tempfile.gettempdir()) / "gt-geo-cache"))

# the dashboard's view: Balkans to Pakistan, Black Sea to the Gulf (panel.js fitExtent)
BBOX = (13.0, 22.0, 74.0, 48.0)
# Three rings of interest. The closer a country is to what the dashboard watches, the smaller a place
# may be and still earn a dot: the point of the layer is detail where records happen, not an even world.
CORE = {"TUR", "CYP", "CYN", "SYR", "IRQ", "GRC", "PSX", "PSE", "ISR", "LBN"}
CORE_POP, CORE_RANK = 50_000, 8
NEAR = {
    "IRN", "JOR", "ARM", "AZE", "GEO", "BGR", "ROU", "SRB", "MKD", "ALB", "BIH", "MNE", "KOS", "MDA",
    "UKR", "RUS", "LBY", "EGY", "SAU", "KWT", "QAT", "BHR", "ARE", "OMN", "YEM", "SDN", "SOM", "DJI",
    "TKM", "UZB", "KAZ", "KGZ", "TJK", "AFG",
}
NEAR_POP, NEAR_RANK = 150_000, 6
FAR_POP = 1_000_000
# a hard ceiling, so a change upstream cannot quietly double the file
LIMIT = 700
# places our map should carry whatever the thresholds say, because our layers or our records point at them
FORCE = {
    "Kyrenia", "Famagusta", "Larnaka", "Gaza City", "Idlib", "Al Qamishli", "Al Hasakah", "Tartus",
    "Ar Raqqah", "Manbij", "Tall Afar", "Zakho", "Kos", "Poti", "Sukhumi", "Tskhinvali", "Gyumri",
    "Naxcivan", "Surt", "Darnah",
}


def fetch(refresh: bool) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "ne_10m_populated_places_simple.geojson"
    if refresh or not path.exists():
        print(f"fetching {SOURCE}", file=sys.stderr)
        with urllib.request.urlopen(SOURCE, timeout=180) as r, path.open("wb") as f:
            f.write(r.read())
    return path


def turkish_names() -> dict[tuple[str, str], str]:
    """Our Turkish names, keyed on (Natural Earth name, country). The country is only filled in where
    Natural Earth uses one name for two places — Tripoli, Al Hillah — and is empty for everything else."""
    with NAMES.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    out: dict[tuple[str, str], str] = {}
    for row in rows:
        ne, tr = (row["natural_earth"] or "").strip(), (row["turkish"] or "").strip()
        a3 = (row.get("a3") or "").strip()
        if not ne or not tr:
            raise SystemExit(f"place_names_tr.csv: a name and a Turkish name are required, got {row!r}")
        if (ne, a3) in out:
            raise SystemExit(f"place_names_tr.csv: {ne} listed twice")
        out[(ne, a3)] = tr
    return out


def keep(p: dict) -> bool:
    if str(p.get("featurecla", "")).startswith("Admin-0 capital"):
        return True
    if (p.get("name") or "").strip() in FORCE:
        return True
    pop = p.get("pop_max") or 0
    rank = p.get("scalerank") if p.get("scalerank") is not None else 99
    a3 = p.get("adm0_a3")
    if a3 in CORE:
        return pop >= CORE_POP or rank <= CORE_RANK
    if a3 in NEAR:
        return pop >= NEAR_POP or rank <= NEAR_RANK
    return pop >= FAR_POP


def build(refresh: bool) -> None:
    src = json.loads(fetch(refresh).read_text(encoding="utf-8"))
    tr = turkish_names()
    known = {((f["properties"].get("name") or "").strip(), f["properties"].get("adm0_a3") or "") for f in src["features"]}
    plain = {n for n, _ in known}
    unknown = sorted(n for n, a3 in tr if (n, a3) not in known and not (a3 == "" and n in plain))
    if unknown:  # a name Natural Earth does not use is a typo in our table, not an opinion
        raise SystemExit("place_names_tr.csv: not a Natural Earth name: " + ", ".join(unknown))
    west, south, east, north = BBOX
    rows = []
    used: set[str] = set()
    for feat in src["features"]:
        p = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"][:2]
        if not (west <= lon <= east and south <= lat <= north):
            continue
        if not keep(p):
            continue
        name = (p.get("name") or "").strip()
        if not name:
            continue
        props = {
            "n": name,
            "a": p.get("adm0_a3"),
            "p": int(p.get("pop_max") or 0),
            "r": int(p.get("scalerank") if p.get("scalerank") is not None else 99),
        }
        if str(p.get("featurecla", "")).startswith("Admin-0 capital"):
            props["cap"] = 1
        a3 = p.get("adm0_a3") or ""
        key = (name, a3) if (name, a3) in tr else (name, "")
        if key in tr:
            props["tr"] = tr[key]
            used.add(key)
        rows.append((props, round(lon, 3), round(lat, 3)))

    # the cap trims by population, but never at the cost of a capital or a place our layers point at
    def pinned(r) -> bool:
        return bool(r[0].get("cap")) or r[0]["n"] in FORCE

    must = [r for r in rows if pinned(r)]
    rest = [r for r in rows if not pinned(r)]
    rest.sort(key=lambda r: (-r[0]["p"], r[0]["n"]))
    rows = must + rest[: max(0, LIMIT - len(must))]
    rows.sort(key=lambda r: (r[0]["n"], r[1], r[2]))  # stable output, independent of the source order

    out = {
        "type": "FeatureCollection",
        "name": "places-10m",
        "description": (
            "Cities shown on the dashboard when it is zoomed in. Source: Natural Earth 1:10m populated "
            "places (public domain), filtered to the dashboard's view. Turkish names are ours "
            "(tools/geo/place_names_tr.csv); `n` is Natural Earth's name, `tr` the Turkish one where we "
            "have it, `a` the ISO alpha-3 of the state Natural Earth assigns it to, `p` population, "
            "`r` scale rank, `cap` a national capital."
        ),
        "features": [
            {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}
            for props, lon, lat in rows
        ],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    missing = sorted(n for n, _ in set(tr) - used)  # in the table but outside the view or below the thresholds
    print(f"{len(rows)} places -> {OUT.relative_to(OUT.parents[4])} ({OUT.stat().st_size / 1024:.0f} KB)")
    print(f"turkish names: {len(used)} used, {len(missing)} unused" + (f": {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="fetch the source again instead of using the cache")
    build(ap.parse_args().refresh)
