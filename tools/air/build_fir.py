"""Flight information regions around Türkiye, and how much of each sea lies in which one.

    https://github.com/vatsimnetwork/vatspy-data-project  (Boundaries.geojson, CC BY-SA 4.0)

A flight information region is the piece of airspace a state provides air traffic services in. It
is not sovereignty and it is not a claim: ICAO assigns it, and the assignment can cover water and
even another state's coast. In this neighbourhood that matters, because the Athinai FIR reaches
the Turkish coast across the Aegean while the sea beneath it is argued about on different grounds
entirely. Drawing the two side by side is the whole point of the layer: they are different maps of
the same water, and confusing them is how most of the bad commentary about this region starts.

**What this source is, and is not.** These boundaries are maintained by a flight-simulation
network from published aeronautical information. They are close, they are openly licensed, and
they are *not* an aeronautical source. The authority for a real boundary is the relevant state's
AIP. Everything this builder writes is therefore marked `schematic: true`, and the page says so
where a reader cannot miss it. Nothing here is usable for navigation and nothing here is evidence
of where a boundary legally runs.

What is taken: the boundary polygon of each FIR that touches the regions this project watches, its
area, and how much of each of the project's sea boxes falls inside it. What is computed: areas on
an equal-area projection, so a number in square kilometres means the same thing at 47°N as at 30°N.

What is never taken: aircraft. No position, no track, no callsign, no flight. This is a map of
airspace structure, not of who is flying in it (handbook ADR 0022 in spirit: the same reason a
vessel's position is not published applies to an aircraft's).

    python tools/air/build_fir.py             # uses the cached download
    python tools/air/build_fir.py --refresh   # fetches the boundaries again
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from pyproj import Geod
from shapely.geometry import box, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "assets" / "data" / "fir.json"

SOURCE = "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson"
SOURCE_PAGE = "https://github.com/vatsimnetwork/vatspy-data-project"
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

# The frame the air page draws, as the sea page has one: wide enough to hold every FIR that touches
# a watch region, tight enough that the Aegean is not a detail in the corner.
VIEW = ((18.0, 28.0), (48.0, 49.0))

# The FIRs this page carries, with the name each is known by. A fixed list rather than "everything
# that intersects the box": a list can be checked by a reader, and an intersection test silently
# gains and loses regions when an upstream boundary is redrawn.
FIRS = {
    "LTBB": {"tr": "İstanbul FIR", "en": "Istanbul FIR", "state": "TUR"},
    "LTAA": {"tr": "Ankara FIR", "en": "Ankara FIR", "state": "TUR"},
    "LGGG": {"tr": "Atina FIR", "en": "Athinai FIR", "state": "GRC"},
    "LCCC": {"tr": "Lefkoşa FIR", "en": "Nicosia FIR", "state": "CYP"},
    "LLLL": {"tr": "Tel Aviv FIR", "en": "Tel Aviv FIR", "state": "ISR"},
    "OSTT": {"tr": "Şam FIR", "en": "Damascus FIR", "state": "SYR"},
    "OJAC": {"tr": "Amman FIR", "en": "Amman FIR", "state": "JOR"},
    "ORBB": {"tr": "Bağdat FIR", "en": "Baghdad FIR", "state": "IRQ"},
    "OIIX": {"tr": "Tahran FIR", "en": "Tehran FIR", "state": "IRN"},
    "HECC": {"tr": "Kahire FIR", "en": "Cairo FIR", "state": "EGY"},
    "LBSR": {"tr": "Sofya FIR", "en": "Sofia FIR", "state": "BGR"},
    "LRBB": {"tr": "Bükreş FIR", "en": "Bucharest FIR", "state": "ROU"},
    "UGGG": {"tr": "Tiflis FIR", "en": "Tbilisi FIR", "state": "GEO"},
    "UKFV": {"tr": "Simferopol FIR", "en": "Simferopol FIR", "state": "UKR"},
    "URRV": {"tr": "Rostov FIR", "en": "Rostov FIR", "state": "RUS"},
}

# The same sea boxes the sea dashboard uses, so the two pages can be read against each other.
SEAS = {
    "blacksea": {"tr": "Karadeniz", "en": "Black Sea", "box": ((27.4, 41.0), (41.8, 47.3))},
    "marmara": {"tr": "Marmara ve Boğazlar", "en": "Marmara and the Straits", "box": ((26.0, 40.0), (30.2, 41.6))},
    "aegean": {"tr": "Ege", "en": "Aegean", "box": ((22.5, 35.0), (28.0, 41.0))},
    "eastmed": {"tr": "Doğu Akdeniz", "en": "Eastern Mediterranean", "box": ((28.0, 30.5), (36.5, 37.0))},
    "cyprus": {"tr": "Kıbrıs çevresi", "en": "Around Cyprus", "box": ((32.0, 34.2), (35.0, 36.0))},
}

GEOD = Geod(ellps="WGS84")


def fetch(cache: Path, refresh: bool) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / "vatspy-boundaries.geojson"
    if not path.exists() or refresh:
        req = urllib.request.Request(SOURCE, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                path.write_bytes(r.read())
        except (urllib.error.URLError, TimeoutError) as e:
            raise SystemExit(f"boundaries: {e}") from e
    return json.loads(path.read_text(encoding="utf-8"))


def km2(geom) -> int:
    """Area in square kilometres, measured on the ellipsoid rather than in degrees.

    A degree of longitude is 111 km at the equator and 76 km at 47°N, so a bounding box in degrees
    is not an area. `Geod.geometry_area_perimeter` integrates on the WGS84 ellipsoid, which is the
    same arithmetic an official figure would use."""
    if geom.is_empty:
        return 0
    area, _ = GEOD.geometry_area_perimeter(geom)
    return round(abs(area) / 1e6)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=os.environ.get("GT_AIR_CACHE", Path(tempfile.gettempdir()) / "gt-air-cache"),
    )
    ap.add_argument("--refresh", action="store_true", help="download the boundaries again")
    args = ap.parse_args()

    raw = fetch(Path(args.cache), args.refresh)
    by_id: dict[str, list] = {}
    for f in raw.get("features", []):
        code = str((f.get("properties") or {}).get("id") or "")
        if code in FIRS:
            by_id.setdefault(code, []).append(f)

    missing = [c for c in FIRS if c not in by_id]
    if missing:
        raise SystemExit(f"boundaries no longer carry: {', '.join(sorted(missing))}")

    frame = box(VIEW[0][0], VIEW[0][1], VIEW[1][0], VIEW[1][1])
    features, rows = [], []
    for code, meta in FIRS.items():
        parts = [shape(f["geometry"]) for f in by_id[code]]
        geom = unary_union([p.buffer(0) for p in parts])
        drawn = geom.intersection(frame)
        if drawn.is_empty:
            continue

        seas = {}
        for key, sea in SEAS.items():
            b = box(sea["box"][0][0], sea["box"][0][1], sea["box"][1][0], sea["box"][1][1])
            overlap = geom.intersection(b)
            if overlap.is_empty:
                continue
            share = km2(overlap) / max(1, km2(b))
            if share < 0.005:  # a slither on a boundary is not a presence in that sea
                continue
            seas[key] = round(share, 4)

        rows.append({
            "fir": code,
            "name_tr": meta["tr"],
            "name_en": meta["en"],
            "state": meta["state"],
            "area_km2": km2(geom),
            "area_in_frame_km2": km2(drawn),
            "seas": seas,
        })
        features.append({
            "type": "Feature",
            "properties": {
                "fir": code,
                "name_tr": meta["tr"],
                "name_en": meta["en"],
                "state": meta["state"],
                "schematic": True,
            },
            "geometry": json.loads(json.dumps(drawn.__geo_interface__)),
        })

    rows.sort(key=lambda r: -r["area_in_frame_km2"])

    # How each sea's airspace is divided. This is the measurement the page is for: in the Aegean
    # the answer is not the same as the answer about the sea beneath it, and the two are argued
    # about on entirely different grounds.
    division = {}
    for key, sea in SEAS.items():
        shares = {r["fir"]: r["seas"][key] for r in rows if key in r["seas"]}
        division[key] = {
            "name_tr": sea["tr"],
            "name_en": sea["en"],
            "box": sea["box"],
            "shares": dict(sorted(shares.items(), key=lambda kv: -kv[1])),
            "accounted": round(sum(shares.values()), 4),
        }

    data = {
        "about": (
            "Flight information regions around Türkiye, and how much of each sea box falls inside "
            "each one. A FIR is where a state provides air traffic services; it is not sovereignty "
            "and it is not a claim, and it often covers water and other states' coasts. The airspace "
            "answer and the maritime answer are different maps of the same water. No aircraft, no "
            "position, no track, no flight: this is a map of structure, not of who is flying."
        ),
        "schematic": True,
        "not_for_navigation": (
            "These boundaries are maintained by a flight-simulation network from published "
            "aeronautical information. They are close and openly licensed, and they are not an "
            "aeronautical source: the authority for a boundary is the relevant state's AIP. "
            "Nothing here may be used for navigation or as evidence of where a boundary legally runs."
        ),
        "source": {
            "name": "VAT-Spy Data Project — Boundaries.geojson",
            "url": SOURCE_PAGE,
            "file": SOURCE,
            "terms": "CC BY-SA 4.0 — this derived file is published under the same licence",
        },
        "method": {
            "frame": VIEW,
            "areas": "WGS84 ellipsoid via pyproj Geod; degrees are not an area",
            "min_share": 0.005,
            "firs_listed": len(rows),
        },
        "built_at": dt.datetime.now(tz=dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "firs": rows,
        "seas": division,
        "geojson": {"type": "FeatureCollection", "features": features},
    }
    OUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    aeg = division["aegean"]["shares"]
    print(
        f"{len(rows)} FIRs -> {OUT.relative_to(ROOT)}; "
        f"Aegean box: " + ", ".join(f"{k} {v:.0%}" for k, v in aeg.items())
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
