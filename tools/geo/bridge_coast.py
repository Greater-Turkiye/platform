#!/usr/bin/env python3
"""Close the seam between the maritime areas and the coastline the site draws.

The maritime areas come from sources with their own, finer coastlines: Marine Regions for the
Black Sea and the Sea of Marmara, and our own construction over Natural Earth 10m for the
schematic areas — which is additionally held back from land by up to 2.5 km so it can be
simplified without ever crossing it. The site, however, draws land from `countries-50m.json`
(Natural Earth 1:50m). Where the two coastlines disagree, an unpainted strip appears between the
blue area and the shore: measured before this step, only 48% of the Turkish sea coast was covered,
with a median gap of 0.30 km and a p90 of 2.03 km. At the old 16x zoom limit that was invisible;
at 192x it reads as the Blue Homeland not touching the country at all.

This step fills exactly that strip and nothing else:

    fill = (area grown by BRIDGE_KM)
             ∩ (our own land grown by BRIDGE_KM)      # only along *our* coast
             − (all land in countries-50m)            # never onto land
             − (foreign land grown by BRIDGE_KM)      # never across a narrow channel

The last line is what keeps the fill honest: in a channel narrower than 2 × BRIDGE_KM — Bodrum–Kos,
Kaş–Meis — no fill is added at all, because there the area's edge is a median line between two
states and not a generalisation artefact. Everywhere else the fill is sea in the 1:50m geometry by
construction, so nothing is claimed that the area did not already claim: the strip is the same
water, drawn up to the shoreline the reader can see.

`own land` is Türkiye for every feature, plus Northern Cyprus for the merged Türkiye + TRNC area
(that feature's coast is also the TRNC coast). Licence blocks are left untouched: they are offshore
blocks with official coordinates and no coastal edge, and so is the Sea of Marmara and the Straits
(see SKIP).

A bridged feature is stamped with `coast_bridge_km`, and this step refuses to bridge it again:
the fill is defined relative to the feature's own edge, so a second pass would creep another
6 km along the coastal band. The stamp is also how a reader of the data knows the geometry carries
a rendering bridge; a rebuild by `build_maritime.py` drops it, and this step has to be re-run.

    python tools/geo/bridge_coast.py [--check]

Run it after `build_maritime.py` (which rewrites the same file) — it reads only files that are in
the repository and makes no network request.

Dependencies: shapely>=2.1.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import shapely
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
DATA = HERE.parent.parent / "apps" / "web" / "assets" / "data"
MARITIME = DATA / "maritime-tur.geojson"
WORLD = DATA / "countries-50m.json"

# The widest seam measured along the Turkish coast is 5.1 km; 6 km closes every one of them and
# still leaves any channel narrower than 12 km to the median rule above.
BRIDGE_KM = 6.0
DEG = 1 / 111.0  # ~1 km in degrees of latitude; the bridge is a rendering tolerance, not a limit
GRID = 1e-4      # the coordinate precision of this file (~11 m)
OWN_LAND = {"default": ("Turkey",), "tur-kktc-med-merged": ("Turkey", "N. Cyprus")}
# The Sea of Marmara and the Straits are not bridged. That feature already covers both Straits on
# purpose — they are narrower than the 1:50m coastline, so the polygon has to sit over the land the
# site draws — and widening it further only paints more of İstanbul blue at close zoom, which is
# exactly what the reader complains about. Its own coastline is a closed sea's; there is no seam to
# close that a reader can see.
SKIP = frozenset({"tur-marmara-straits"})
SNAP_SLACK_KM2 = 5.0  # measured worst case: +1.4 km² on the merged Eastern Mediterranean area


def topo_features(path: Path, obj: str) -> list[tuple[str, object]]:
    """Decode a world-atlas topojson object into (name, geometry) pairs."""
    topo = json.loads(path.read_text(encoding="utf-8"))
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

    out = []
    for g in topo["objects"][obj]["geometries"]:
        if g["type"] == "Polygon":
            geom = {"type": "Polygon", "coordinates": [ring(r) for r in g["arcs"]]}
        elif g["type"] == "MultiPolygon":
            geom = {"type": "MultiPolygon", "coordinates": [[ring(r) for r in p] for p in g["arcs"]]}
        else:
            continue
        out.append((g.get("properties", {}).get("name"), shape(geom).buffer(0)))
    return out


def bridged(area, own, foreign, all_land, d: float):
    """The area with the coastal seam against `own` filled in; see the module docstring."""
    fill = area.buffer(d).intersection(own.buffer(d)).difference(all_land).difference(foreign.buffer(d))
    # Snap the fill to the file's grid *before* taking land off it, so the snapping cannot push it
    # onto the shore. The area itself is left exactly as the builder wrote it: it may overlap land
    # on purpose — the Sea of Marmara polygon covers both Straits, which are narrower than the
    # 1:50m coastline — and cutting that away would erase the Straits from the map.
    fill = shapely.set_precision(fill, GRID).difference(all_land)
    if fill.is_empty:
        return area, 0.0
    out = unary_union([area, fill])
    out = unary_union([p for p in shapely.get_parts(out) if isinstance(p, Polygon)])
    if isinstance(out, Polygon):
        out = MultiPolygon([out])
    return out, (out.area - area.area) * 111 * 111


def main(check: bool) -> None:
    land = topo_features(WORLD, "countries")
    all_land = unary_union([g for _, g in land])
    by_name = {}
    for name, g in land:
        by_name.setdefault(name, []).append(g)
    named = {n: unary_union(v) for n, v in by_name.items()}

    fc = json.loads(MARITIME.read_text(encoding="utf-8"))
    d = BRIDGE_KM * DEG
    changed = 0
    for f in fc["features"]:
        p = f["properties"]
        if f["geometry"]["type"] not in ("Polygon", "MultiPolygon") or p.get("status") == "licence":
            continue
        if p.get("coast_bridge_km") or p["id"] in SKIP:  # already bridged, or never bridged
            continue
        own_names = OWN_LAND.get(p["id"], OWN_LAND["default"])
        own = unary_union([named[n] for n in own_names])
        foreign = unary_union([g for n, g in land if n not in own_names])
        area = shape(f["geometry"]).buffer(0)
        out, added = bridged(area, own, foreign, all_land, d)
        if added <= 0:
            continue
        assert out.is_valid, p["id"]
        # The bridge adds no land cover of its own. These areas already overlap the 1:50m land by
        # 400-1200 km² each — their own coastlines are finer than the one the site draws — and the
        # only increase allowed here is grid snapping along a coastline more than a thousand
        # kilometres long: SNAP_SLACK_KM2 is where that stops being noise.
        before = area.intersection(all_land).area * 111 * 111
        after = out.intersection(all_land).area * 111 * 111
        assert after - before <= SNAP_SLACK_KM2, (p["id"], before, after)
        geom = mapping(shapely.orient_polygons(out, exterior_cw=True))
        geom = json.loads(json.dumps(geom))  # tuples -> lists, as the rest of the file
        if geom != f["geometry"]:
            changed += 1
            print(f"{p['id']:26} +{added:7.1f} km² along the coast")
            f["geometry"] = geom
            p["coast_bridge_km"] = BRIDGE_KM
            for lang, text in (
                ("tr", f"Kıyı birleştirme: alan, sitenin çizdiği 1:50m kıyı çizgisine kadar {BRIDGE_KM:.0f} km'ye "
                       "kadar genişletildi (yalnızca Türkiye kıyısı boyunca, kara üzerine taşmadan ve dar "
                       "boğazlarda orta hattı geçmeden); bir çizim düzeltmesidir, yetki alanı iddiası değildir."),
                ("en", f"Coast bridge: the area was extended by up to {BRIDGE_KM:.0f} km to the 1:50m coastline the "
                       "site draws — only along the Turkish coast, never onto land and never past the median in a "
                       "narrow channel. It is a rendering correction, not a claim."),
            ):
                for key in (f"method_{lang}", f"basis_{lang}", f"note_{lang}"):
                    if key in p:
                        p[key] = p[key].rstrip() + " " + text
                        break

    if check:
        print(f"{changed} feature(s) would change")
        raise SystemExit(1 if changed else 0)
    if changed:
        MARITIME.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{changed} feature(s) bridged -> {MARITIME.relative_to(MARITIME.parents[4])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="report what would change and exit non-zero if anything would")
    main(ap.parse_args().check)
