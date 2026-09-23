"""One merged coastline for the frame the map pages draw, used as a water mask.

The maritime areas and the coastline the site draws are two different generalisations of the same
coast, and they disagree. Measured: 2,668 km² of sea polygon sits on 1:50m land — spread over
36-61 small fragments per area, in the gulfs and inlets the 1:50m coastline smooths across (İzmit,
Erdek, Gökova), not in one fixable place. Against 1:10m land it is 2,875 km², so it is not a matter
of one file being coarse: neither coastline is the other's.

Clipping the areas to the drawn coast is the wrong fix twice over. It would degrade geometry that
came from official coordinates to match a rendering asset, and it would erase the Bosphorus and the
Dardanelles, which are narrower than the 1:50m coastline and whose overlap is deliberate.

So this is solved where it belongs, in rendering: a mask that lets the sea layers paint water and
never land. The map already knows where the land is; this is the same land as a single merged
outline, which an SVG mask can evaluate once instead of per country.

    python tools/geo/build_coast.py             # uses the cached download
    python tools/geo/build_coast.py --refresh   # fetches Natural Earth again

Why 1:10m and not the 1:50m the pages draw: the mask has to be at least as fine as the finest thing
it masks, or it cuts into real water. 10m clipped to the frame and rounded to four decimals is
smaller than the 1:50m world file the pages already load, because it carries one region and no
country boundaries.
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import os
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import shapefile
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "assets" / "data" / "coast-10m.json"

NE_LAND = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip"
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

# The widest frame any map page draws (the air dashboard's), with a margin so a mask never runs
# out before the map does.
FRAME = (16.0, 26.0, 50.0, 51.0)

# Four decimals is about 8 m at this latitude — an order of magnitude finer than the 10m source
# itself, so the rounding cannot be what puts the mask in the wrong place, and it halves the file.
PLACES = 4

# Anything smaller than this is a rock the mask does not need: at the deepest zoom the pages allow
# it is under a pixel, and keeping it costs more than it hides.
MIN_KM2 = 0.5


def fetch(cache: Path, refresh: bool) -> bytes:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / "ne_10m_land.zip"
    if not path.exists() or refresh:
        req = urllib.request.Request(NE_LAND, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                path.write_bytes(r.read())
        except (urllib.error.URLError, TimeoutError) as e:
            raise SystemExit(f"coast: {e}") from e
    return path.read_bytes()


def round_coords(o, n=PLACES):
    if isinstance(o, (list, tuple)):
        if o and isinstance(o[0], (int, float)):
            return [round(float(v), n) for v in o]
        return [round_coords(x, n) for x in o]
    return o


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=os.environ.get("GT_GEO_CACHE", Path(tempfile.gettempdir()) / "gt-geo-cache"),
    )
    ap.add_argument("--refresh", action="store_true", help="download Natural Earth again")
    args = ap.parse_args()

    z = zipfile.ZipFile(io.BytesIO(fetch(Path(args.cache), args.refresh)))
    r = shapefile.Reader(
        shp=io.BytesIO(z.read("ne_10m_land.shp")),
        shx=io.BytesIO(z.read("ne_10m_land.shx")),
        dbf=io.BytesIO(z.read("ne_10m_land.dbf")),
    )
    land = unary_union([shape(s.__geo_interface__).buffer(0) for s in r.shapes()])
    clipped = land.intersection(box(*FRAME))

    # one degree squared is about 111 x 111 km here; good enough to drop rocks by
    small = MIN_KM2 / (111.0 * 111.0)
    parts = [p for p in getattr(clipped, "geoms", [clipped]) if p.area >= small]
    kept = unary_union(parts)

    geom = mapping(kept)
    geom = {"type": geom["type"], "coordinates": round_coords(geom["coordinates"])}
    data = {
        "about": (
            "One merged coastline for the frame the map pages draw, used as a water mask so the "
            "maritime layers paint water and never land. It is not a country layer and carries no "
            "boundaries: the pages draw those from countries-50m.json as before."
        ),
        "source": {
            "name": "Natural Earth 1:10m physical land",
            "url": NE_LAND,
            "terms": "Public domain",
        },
        "method": {
            "frame": FRAME,
            "decimals": PLACES,
            "min_part_km2": MIN_KM2,
            "parts": len(parts),
        },
        "built_at": dt.datetime.now(tz=dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "land": geom,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8", newline="\n")
    size = OUT.stat().st_size
    print(f"{len(parts)} land parts -> {OUT.relative_to(ROOT)} ({size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
