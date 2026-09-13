"""Build ``gt_collectors/data/tr_geofence.json`` from the vendored Natural Earth TopoJSON.

Usage (from the repository root)::

    python -m gt_collectors.tools.build_geofence            # rewrite the vendored file
    python -m gt_collectors.tools.build_geofence --check    # exit 1 if it is out of date

Steps:

1. Decode feature ``id == "792"`` (Türkiye) from ``apps/web/assets/data/countries-50m.json``
   (world-atlas 2.0.2, Natural Earth 1:50m admin-0, public domain).
2. Add a hand-drawn polygon covering Türkiye's internal waters that Natural Earth leaves open
   between the Thrace and Anatolia polygons: the Sea of Marmara, the Bosphorus and the
   Dardanelles. Its vertices lie on Turkish land or inside the straits.
3. Simplify each ring with Douglas-Peucker and record the maximum deviation (km) of the
   original vertices from the simplified ring; the geofence adds it to the buffer radius.

The output is deterministic, and a test checks that the vendored file matches a fresh build.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

from gt_collectors.geo import KM_PER_DEG_LAT, KM_PER_DEG_LON_EQUATOR, distance_km_to_segment

FEATURE_ID = "792"
SOURCE_REL = "apps/web/assets/data/countries-50m.json"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "tr_geofence.json"
SIMPLIFY_TOLERANCE_KM = 0.5
BUFFER_NM = 12.0
# Natural Earth 1:50m is a small-scale product; allow for its positional error on top of the
# simplification error. Larger is safer (more is dropped).
SOURCE_MARGIN_KM = 2.0
COORD_DECIMALS = 5  # ~1 m

# (lon, lat). Hand-drawn; every vertex is on Turkish land or in the straits. Generous on purpose.
INTERNAL_WATERS = [
    (26.05, 39.95),  # Dardanelles, Aegean mouth (south-west)
    (26.10, 40.15),
    (26.55, 40.55),  # Gelibolu peninsula
    (27.30, 40.85),
    (28.00, 41.10),
    (28.90, 41.15),
    (29.00, 41.30),  # Bosphorus, Black Sea mouth
    (29.25, 41.30),
    (29.25, 41.00),
    (30.05, 40.80),  # head of the Gulf of İzmit
    (29.95, 40.60),
    (29.00, 40.30),  # Gemlik / Mudanya
    (27.80, 40.25),  # Bandırma
    (27.00, 40.25),
    (26.45, 39.95),  # Çanakkale
]


def repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / SOURCE_REL).is_file():
            return parent
    raise FileNotFoundError(f"cannot find {SOURCE_REL} above {__file__}")


def decode_feature(topo: dict, feature_id: str) -> list[list[tuple[float, float]]]:
    """Return the outer rings of a (Multi)Polygon feature as lists of (lon, lat)."""
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]

    def arc_points(index: int) -> list[tuple[float, float]]:
        arc = topo["arcs"][~index if index < 0 else index]
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        return pts[::-1] if index < 0 else pts

    for geom in topo["objects"]["countries"]["geometries"]:
        if geom.get("id") != feature_id:
            continue
        polygons = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        rings = []
        for polygon in polygons:
            if len(polygon) != 1:
                raise ValueError("holes are not supported")
            ring: list[tuple[float, float]] = []
            for arc_index in polygon[0]:
                pts = arc_points(arc_index)
                ring.extend(pts[1:] if ring else pts)  # consecutive arcs share an endpoint
            if ring[0] == ring[-1]:
                ring.pop()
            rings.append(ring)
        return rings
    raise KeyError(f"feature {feature_id} not found")


def _to_xy(p: tuple[float, float], lat0: float) -> tuple[float, float]:
    return (p[0] * KM_PER_DEG_LON_EQUATOR * math.cos(math.radians(lat0)), p[1] * KM_PER_DEG_LAT)


def douglas_peucker(points: list[tuple[float, float]], tol_km: float) -> list[tuple[float, float]]:
    """Simplify an open polyline (endpoints kept)."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        best, best_k = -1.0, -1
        for k in range(i + 1, j):
            p = points[k]
            d = distance_km_to_segment(p[1], p[0], points[i], points[j])
            if d > best:
                best, best_k = d, k
        if best > tol_km:
            keep[best_k] = True
            stack.extend(((i, best_k), (best_k, j)))
    return [p for p, k in zip(points, keep, strict=True) if k]


def simplify_ring(ring: list[tuple[float, float]], tol_km: float) -> list[tuple[float, float]]:
    """Split the closed ring at its first vertex and the vertex farthest from it, simplify both."""
    if len(ring) <= 4:
        return list(ring)
    lat0 = sum(p[1] for p in ring) / len(ring)
    x0, y0 = _to_xy(ring[0], lat0)
    far = max(range(len(ring)), key=lambda k: math.dist((x0, y0), _to_xy(ring[k], lat0)))
    first = douglas_peucker(ring[: far + 1], tol_km)
    second = douglas_peucker([*ring[far:], ring[0]], tol_km)
    return first[:-1] + second[:-1]


def max_deviation_km(original: list[tuple[float, float]], simplified: list[tuple[float, float]]) -> float:
    worst = 0.0
    n = len(simplified)
    for p in original:
        d = min(distance_km_to_segment(p[1], p[0], simplified[i], simplified[(i + 1) % n]) for i in range(n))
        worst = max(worst, d)
    return worst


def build(root: Path | None = None) -> dict:
    root = root or repo_root()
    topo = json.loads((root / SOURCE_REL).read_text(encoding="utf-8"))
    land = decode_feature(topo, FEATURE_ID)
    canonical = json.dumps(land, separators=(",", ":")).encode()
    polygons = []
    worst = 0.0
    for ring in land:
        simple = simplify_ring(ring, SIMPLIFY_TOLERANCE_KM)
        rounded = [(round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)) for x, y in simple]
        worst = max(worst, max_deviation_km(ring, rounded))
        polygons.append({"role": "land", "vertices_source": len(ring), "ring": [list(p) for p in rounded]})
    polygons.append(
        {
            "role": "internal-waters",
            "vertices_source": len(INTERNAL_WATERS),
            "ring": [list(p) for p in INTERNAL_WATERS],
        }
    )
    return {
        "schema": "gt-geofence/1",
        "name": "TUR",
        "description": "Türkiye land (Natural Earth 1:50m) + internal waters (Sea of Marmara, straits). "
        "Consumers add a uniform buffer of buffer_nm plus the recorded margins.",
        "buffer_nm": BUFFER_NM,
        "simplify_tolerance_km": SIMPLIFY_TOLERANCE_KM,
        "max_simplification_error_km": math.ceil(worst * 1000) / 1000,
        "source_margin_km": SOURCE_MARGIN_KM,
        "provenance": {
            "land": {
                "source": "Natural Earth 1:50m Admin 0 - Countries, via world-atlas 2.0.2 countries-50m.json",
                "source_path": SOURCE_REL,
                "feature_id": FEATURE_ID,
                "licence": "Natural Earth data is in the public domain; world-atlas packaging is ISC",
                "decoded_rings_sha256": hashlib.sha256(canonical).hexdigest(),
                "note": "1:50m omits small islands (e.g. Bozcaada, Marmara islands); the buffer around the "
                "mainland covers them but not their full territorial sea.",
            },
            "internal-waters": {
                "source": "hand-drawn in this repository (gt_collectors/tools/build_geofence.py)",
                "licence": "public domain / MIT",
            },
            "builder": "python -m gt_collectors.tools.build_geofence",
        },
        "polygons": polygons,
    }


def render(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the vendored file is out of date")
    args = parser.parse_args(argv)
    text = render(build())
    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != text:
            print(
                f"{OUTPUT} is out of date; run python -m gt_collectors.tools.build_geofence", file=sys.stderr
            )
            return 1
        return 0
    OUTPUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUTPUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
