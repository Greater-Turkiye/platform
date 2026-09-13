#!/usr/bin/env python3
"""Türkiye's officially announced cross-border operation areas, at AREA level only.

Output (RFC 7946 GeoJSON, WGS84 [lon, lat], 3 decimals, exterior rings counter-clockwise):
  apps/web/assets/data/tur-operation-areas.geojson

Scope (handbook ADR 0015, which supersedes ADR 0014 §3): whole zones as officially announced by
the Turkish state, each with a status and an as-of date. The layer never contains, and no feature
carries properties describing: bases, observation posts, outposts, checkpoints; unit names or
strengths; troop positions or movements; any point data inside a zone. Official Turkish military
presence stays at country level (ADR 0013 §3).

Inputs:
  tools/geo/operation_areas.json — one entry per zone: names, announcement date, status and as-of
      date, notes, the OCHA sub-district p-codes that make up the zone, an optional depth limit,
      and the sources (official first). All text lives there; this script adds geometry and areas.
  OCHA COD-AB Syria via HDX (CC BY-IGO 3.0): syr_admin_boundaries.shp.zip, layer syr_admin3
      (sub-districts, "nahiye"). Pinned by SHA-256 in the JSON.
  Natural Earth 10m admin-0 countries (public domain): Türkiye, for the depth limit only.
  apps/web/assets/data/countries-50m.json: the site's own Natural Earth 1:50m basemap (world-atlas
      topojson); Syria from it is the final clip, so a fill never crosses the border the site draws.

Processing:
  1. per zone, dissolve the listed sub-districts (every p-code must exist; names are checked);
  2. optional `depth_km`: keep the part within that distance of Türkiye (NE 10m), measured in a
     local Lambert azimuthal equal-area projection (LAEA_CRS);
  3. clip to countries-50m Syria;
  4. coverage simplification of all zones together (shapely.coverage_simplify, Visvalingam–Whyatt,
     tolerance SIMPLIFY_DEG = 0.005°), so zones that share an edge (Afrin district / A'zaz and Suran
     sub-districts) keep one identical edge; clip again to Syria shrunk by 0.75 grid cells; snap to a
     1e-3° grid; drop parts smaller than MIN_PART_KM2; orient exterior rings counter-clockwise
     (RFC 7946; the site rewinds for d3);
  5. asserts: valid, non-empty, counter-clockwise, ≤ MAX_OUTSIDE_KM2 outside countries-50m Syria,
     zones do not overlap (beyond grid noise), property keys from ALLOWED_KEYS only, no key or
     sub-key that looks like point/position/unit data (FORBIDDEN_KEY).
  The report also gives, for zones with a depth limit, the distance of each sub-district's seat
  (HDX syr_admincapitals) from Türkiye — a check on the method text only; no point is written.

Usage:
  python tools/geo/build_operation_areas.py [--cache DIR] [--preview tools/geo/operation-areas-preview.png]

Dependencies: shapely>=2.1, pyshp (shapefile), pyproj; matplotlib only for --preview.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import shapefile  # pyshp
import shapely
from pyproj import Geod, Transformer
from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import transform, unary_union

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "apps" / "web" / "assets" / "data"
OUT = DATA / "tur-operation-areas.geojson"
INPUTS = HERE / "operation_areas.json"
BASEMAP = DATA / "countries-50m.json"
UA = "GreaterTurkiye-geodata/0.1 (+https://github.com/Greater-Turkiye/platform)"

NE_ADMIN0 = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
BASEMAP_SYRIA_ID = "760"      # ISO 3166-1 numeric, as used by world-atlas
BASEMAP_IRAQ_ID = "368"
LAEA_CRS = "+proj=laea +lat_0=36.5 +lon_0=38.5 +datum=WGS84 +units=m +no_defs"
SIMPLIFY_DEG = 0.005
GRID_DEG = 1e-3
MIN_PART_KM2 = 1.0
MAX_OUTSIDE_KM2 = 0.01
MAX_OVERLAP_KM2 = 0.05

ALLOWED_KEYS = [
    "id", "kind", "name_tr", "name_en", "operation_tr", "operation_en", "announced", "status",
    "status_as_of", "schematic", "note_tr", "note_en", "status_note_tr", "status_note_en",
    "geometry_method_tr", "geometry_method_en", "area_km2", "admin_areas", "attribution", "sources",
]
SOURCE_KEYS = ["title", "publisher", "url", "date", "accessed"]
STATUSES = {"active", "ended", "unclear"}
# Keys that would describe military detail or point data; never allowed at any depth.
FORBIDDEN_KEY = re.compile(r"base|post|checkpoint|outpost|troop|unit_?name|strength|position|movement|"
                           r"deploy|label_at|point|coord|lat$|lon$", re.I)

GEOD = Geod(ellps="WGS84")
_fw = Transformer.from_crs("EPSG:4326", LAEA_CRS, always_xy=True).transform
_bw = Transformer.from_crs(LAEA_CRS, "EPSG:4326", always_xy=True).transform


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def km2(g) -> float:
    """Geodesic area; rings oriented first so parts never cancel in pyproj's signed sum."""
    if g.is_empty:
        return 0.0
    return abs(GEOD.geometry_area_perimeter(shapely.orient_polygons(g, exterior_cw=False))[0]) / 1e6


def parts(g) -> list:
    if g.is_empty:
        return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]


def polys_only(g):
    return unary_union([p for p in parts(g) if isinstance(p, Polygon) and not p.is_empty])


def fmt(n: float, lang: str) -> str:
    s = f"{round(n):,}"
    return s.replace(",", ".") if lang == "tr" else s


def fetch(url: str, cache: Path, name: str) -> bytes:
    p = cache / name
    if not p.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r:
            p.write_bytes(r.read())
    return p.read_bytes()


def read_shp(raw: bytes, stem: str, encoding: str):
    z = zipfile.ZipFile(io.BytesIO(raw))
    r = shapefile.Reader(shp=io.BytesIO(z.read(stem + ".shp")), shx=io.BytesIO(z.read(stem + ".shx")),
                         dbf=io.BytesIO(z.read(stem + ".dbf")), encoding=encoding)
    return [(sr.record.as_dict(), shape(sr.shape.__geo_interface__)) for sr in r.iterShapeRecords()]


def topo_country(path: Path, cid: str):
    """One country from a world-atlas topojson (quantized, delta-encoded arcs)."""
    d = json.loads(path.read_text(encoding="utf-8"))
    (sx, sy), (tx, ty) = d["transform"]["scale"], d["transform"]["translate"]
    arcs = []
    for arc in d["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x, y = x + dx, y + dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        out: list = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a if not out else a[1:])
        return out

    g = next(g for g in d["objects"]["countries"]["geometries"] if str(g.get("id")) == cid)
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
    return shapely.make_valid(unary_union([Polygon(ring(p[0]), [ring(h) for h in p[1:]]) for p in polys]))


def geojson_geom(g) -> dict:
    m = mapping(g)

    def r(c):
        return [round(c[0], 3), round(c[1], 3)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": m["type"], "coordinates": r(json.loads(json.dumps(m["coordinates"])))}


def write_fc(path: Path, features: list[dict], meta: dict):
    """One feature per line for readable diffs; UTF-8, no ASCII escaping (as build_maritime.py)."""
    head = json.dumps({"type": "FeatureCollection", **meta}, ensure_ascii=False)[:-1]
    body = ",\n".join(json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in features)
    path.write_text(head + ',"features":[\n' + body + "\n]}\n", encoding="utf-8", newline="\n")


def check_keys(obj, where: str):
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert not FORBIDDEN_KEY.search(k), f"forbidden key {k!r} in {where}"
            check_keys(v, f"{where}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            check_keys(v, f"{where}[{i}]")


# --------------------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------------------
def load_inputs() -> dict:
    cfg = json.loads(INPUTS.read_text(encoding="utf-8"))
    lib = cfg["sources"]
    for z in cfg["zones"]:
        assert z["status"] in STATUSES, z["id"]
        z["_sources"] = []
        for key in z["source_keys"]:
            s = lib[key]
            assert list(s) == SOURCE_KEYS, (key, list(s))
            z["_sources"].append(s)
    return cfg


def hdx_admin3(cfg: dict, cache: Path, report: list[str]):
    h = cfg["hdx"]
    raw = fetch(h["resource_url"], cache, h["cache_name"])
    sha = hashlib.sha256(raw).hexdigest()
    assert sha == h["sha256"], (f"HDX file changed: {sha} != pinned {h['sha256']}. Review the new release "
                                "(p-codes, names, boundaries) and update operation_areas.json.")
    report.append(f"HDX COD-AB Syria: {h['cache_name']} sha256 {sha[:16]}… ({len(raw):,} bytes)")
    recs = read_shp(raw, "syr_admin3", "utf-8")
    return {r["adm3_pcode"]: (r, g) for r, g in recs}


def seat_check(cfg: dict, cache: Path, final: dict, tur, report: list[str]):
    """Report only (never written to the data): for zones with a depth limit, distance of each
    sub-district's administrative seat (HDX syr_admincapitals) from Türkiye and whether it is inside."""
    raw = fetch(cfg["hdx"]["resource_url"], cache, cfg["hdx"]["cache_name"])
    seats = {r["adm3_pcode"]: g for r, g in read_shp(raw, "syr_admincapitals", "utf-8") if r["adm_p_lvl"] in (2, 3)}
    tur_m = transform(_fw, tur.intersection(box(34, 34, 45, 39)))
    for z in cfg["zones"]:
        if not z.get("depth_km"):
            continue
        for a in z["admin_areas"]:
            p = seats.get(a["pcode"])
            if p is None:
                report.append(f"{z['id']}: no seat point for {a['name_en']} in syr_admincapitals")
                continue
            d = transform(_fw, p).distance(tur_m) / 1000
            report.append(f"{z['id']}: seat of {a['name_en']} is {d:.1f} km from Türkiye (NE 10m); "
                          f"{'inside' if final[z['id']].contains(p) else 'outside'} the zone")


def turkiye_ne10m(cache: Path):
    recs = read_shp(fetch(NE_ADMIN0, cache, "ne_10m_admin_0_countries.zip"), "ne_10m_admin_0_countries", "latin-1")
    return next(g for r, g in recs if r["ADM0_A3"] == "TUR")


def raw_zone(z: dict, adm3: dict, tur, report: list[str]):
    geoms, names = [], []
    for a in z["admin_areas"]:
        rec, g = adm3[a["pcode"]]
        assert rec["adm3_name"] == a["name_en"], (a["pcode"], rec["adm3_name"], a["name_en"])
        assert rec["adm0_pcode"] == "SY"
        geoms.append(shapely.make_valid(g))
        names.append(rec["adm3_name"])
    u = polys_only(unary_union(geoms))
    km_units = km2(u)
    report.append(f"{z['id']}: {len(geoms)} sub-districts ({', '.join(names)}), dissolved {km_units:,.0f} km², "
                  f"{len(parts(u))} part(s)")
    if z.get("depth_km"):
        tur_m = transform(_fw, tur.intersection(box(34, 34, 45, 39)))
        band = transform(_bw, tur_m.buffer(z["depth_km"] * 1000, quad_segs=32))
        u = polys_only(u.intersection(band))
        report.append(f"{z['id']}: within {z['depth_km']} km of Türkiye (NE 10m, LAEA) {km2(u):,.0f} km²")
    return u, km_units


def finish(zones_raw: dict, syria, report: list[str]) -> dict:
    ids = list(zones_raw)
    clipped = [polys_only(zones_raw[i].intersection(syria)) for i in ids]
    for i, g in zip(ids, clipped):
        report.append(f"{i}: clipped to countries-50m Syria {km2(g):,.0f} km² "
                      f"(removed {km2(zones_raw[i]) - km2(g):,.1f} km² outside the basemap's Syria)")
    cov = [MultiPolygon(parts(g)) for g in clipped]
    assert shapely.coverage_is_valid(cov), "zones are not a valid coverage (overlap or mismatched edges)"
    simp = shapely.coverage_simplify(cov, SIMPLIFY_DEG, simplify_boundary=True)
    # Final clip against Syria shrunk by 0.75 grid cells, so snapping to the grid cannot push a
    # vertex across the basemap border (leaves a gap of ≤ ~80 m along it, invisible on the site).
    inner = syria.buffer(-0.75 * GRID_DEG, quad_segs=4)
    out = {}
    for i, g in zip(ids, simp):
        g = polys_only(shapely.make_valid(g).intersection(inner))
        g = shapely.set_precision(g, GRID_DEG)
        keep = [p for p in parts(polys_only(g)) if km2(p) >= MIN_PART_KM2]
        dropped = len(parts(polys_only(g))) - len(keep)
        g = unary_union(keep)
        g = shapely.orient_polygons(g, exterior_cw=False)
        assert g.is_valid and not g.is_empty, i
        for p in parts(g):
            assert p.exterior.is_ccw and all(not r.is_ccw for r in p.interiors), i
        out[i] = g
        n = len(shapely.get_coordinates(g))
        report.append(f"{i}: simplified {n} vertices, {len(parts(g))} part(s), {sum(len(p.interiors) for p in parts(g))} "
                      f"hole(s), {km2(g):,.1f} km²; dropped {dropped} part(s) < {MIN_PART_KM2:g} km²")
    return out


def validate(final: dict, syria, iraq, report: list[str]):
    for i, g in final.items():
        outside = km2(polys_only(g.difference(syria)))
        assert outside <= MAX_OUTSIDE_KM2, (i, outside)
        in_iraq = km2(polys_only(g.intersection(iraq))) if g.intersects(iraq) else 0.0
        report.append(f"{i}: outside countries-50m Syria {outside:.4f} km² "
                      f"({100 * (1 - outside / km2(g)):.4f} % inside); in Iraq {in_iraq:.2f} km²")
    ids = list(final)
    worst = 0.0
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            ov = final[ids[a]].intersection(final[ids[b]])
            ov_km2 = km2(polys_only(ov)) if not ov.is_empty else 0.0
            assert ov_km2 <= MAX_OVERLAP_KM2, (ids[a], ids[b], ov_km2)
            worst = max(worst, ov_km2)
    report.append(f"Zones overlap: max {worst:.3f} km² (limit {MAX_OVERLAP_KM2} km²)")


def feature(z: dict, g, km_units: float, cfg: dict) -> dict:
    area = km2(g)
    vals = {"area_units_tr": fmt(km_units, "tr"), "area_units_en": fmt(km_units, "en"),
            "area_tr": fmt(area, "tr"), "area_en": fmt(area, "en"),
            "tol": f"{SIMPLIFY_DEG:g}", "tol_tr": f"{SIMPLIFY_DEG:g}".replace(".", ","),
            "depth": str(z.get("depth_km", ""))}
    props = {
        "id": z["id"], "kind": "operation-area",
        "name_tr": z["name_tr"], "name_en": z["name_en"],
        "operation_tr": z["operation_tr"], "operation_en": z["operation_en"],
        "announced": z["announced"], "status": z["status"], "status_as_of": cfg["status_as_of"],
        "schematic": z["schematic"],
        "note_tr": z["note_tr"], "note_en": z["note_en"],
        "status_note_tr": z["status_note_tr"], "status_note_en": z["status_note_en"],
        "geometry_method_tr": z["geometry_method_tr"].format(**vals),
        "geometry_method_en": z["geometry_method_en"].format(**vals),
        "area_km2": round(area),
        "admin_areas": [{"pcode": a["pcode"], "name_en": a["name_en"], "name_tr": a["name_tr"]} for a in z["admin_areas"]],
        "attribution": cfg["hdx"]["attribution"],
        "sources": z["_sources"],
    }
    assert list(props) == ALLOWED_KEYS
    check_keys(props, z["id"])
    return {"type": "Feature", "properties": props, "geometry": geojson_geom(g)}


def preview(png: Path, final: dict, cfg: dict, adm3: dict, syria, cache: Path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path as MPath

    recs = read_shp(fetch(NE_ADMIN0, cache, "ne_10m_admin_0_countries.zip"), "ne_10m_admin_0_countries", "latin-1")
    frame = box(35.9, 35.7, 41.3, 37.5)
    fig, ax = plt.subplots(figsize=(12, 5.6), dpi=110)

    def draw(g, **kw):
        for p in parts(g):
            rings = [p.exterior] + list(p.interiors)
            verts = [c for r in rings for c in r.coords]
            codes = [c for r in rings for c in [MPath.MOVETO] + [MPath.LINETO] * (len(r.coords) - 1)]
            ax.add_patch(PathPatch(MPath(verts, codes), **kw))

    for r, g in recs:
        if r["ADM0_A3"] in ("TUR", "SYR", "IRQ", "LBN", "ISR", "JOR", "IRN", "CYP", "CYN") and g.intersects(frame):
            draw(g.intersection(frame), fc="#ece9e2" if r["ADM0_A3"] != "TUR" else "#f6e7e3", ec="#8a857c", lw=0.6)
            c = g.intersection(frame).representative_point()
            ax.annotate(r["NAME"], (c.x, c.y), fontsize=7, color="#8a857c", ha="center")
    draw(syria.intersection(frame), fc="none", ec="#444", lw=0.8, ls="--")
    for z in cfg["zones"]:
        for a in z["admin_areas"]:
            draw(adm3[a["pcode"]][1], fc="none", ec="#6b8f6b", lw=0.4, ls=":")
    offsets = {"tur-op-zeytin-dali": (-60, -95), "tur-op-firat-kalkani": (110, -120), "tur-op-baris-pinari": (0, -70)}
    for z in cfg["zones"]:
        g = final[z["id"]]
        draw(g, fc="#2e7d32", alpha=0.45, ec="#1b5e20", lw=1.0, hatch="///" if z["schematic"] else None)
        c = g.representative_point()   # preview label anchor only; never written to the data
        label = (f"{z['operation_tr']} / {z['operation_en']}\n{z['status']} as of {cfg['status_as_of']}; "
                 f"{km2(g):,.0f} km²" + ("; schematic" if z["schematic"] else ""))
        ax.annotate(label, (c.x, c.y), xytext=offsets.get(z["id"], (0, -60)), textcoords="offset points",
                    fontsize=7, ha="center", va="top", color="#0b3d0b", weight="bold",
                    arrowprops={"arrowstyle": "-", "color": "#1b5e20", "lw": 0.6})
    ax.set_xlim(frame.bounds[0], frame.bounds[2]); ax.set_ylim(frame.bounds[1], frame.bounds[3])
    ax.set_aspect(1 / 0.8)
    ax.set_title("tur-operation-areas.geojson — preview. Green: Türkiye's officially announced operation areas (area level); "
                 "hatched: schematic extent\ndotted: OCHA sub-districts used; dashed: Syria in countries-50m (site basemap); "
                 "background: Natural Earth 10m admin-0", fontsize=8)
    ax.grid(lw=0.2)
    fig.tight_layout(); fig.savefig(png); plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "gt-geo-cache")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--preview", type=Path)
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)

    report: list[str] = []
    cfg = load_inputs()
    adm3 = hdx_admin3(cfg, args.cache, report)
    tur = turkiye_ne10m(args.cache)
    syria = topo_country(BASEMAP, BASEMAP_SYRIA_ID)
    iraq = topo_country(BASEMAP, BASEMAP_IRAQ_ID)
    raw, km_units = {}, {}
    for z in cfg["zones"]:
        raw[z["id"]], km_units[z["id"]] = raw_zone(z, adm3, tur, report)
    final = finish(raw, syria, report)
    validate(final, syria, iraq, report)
    seat_check(cfg, args.cache, final, tur, report)
    feats = [feature(z, final[z["id"]], km_units[z["id"]], cfg) for z in cfg["zones"]]
    meta = {"name": "tur-operation-areas", "description": cfg["description"]}
    write_fc(args.out, feats, meta)
    total = sum(len(shapely.get_coordinates(shape(f["geometry"]))) for f in feats)
    report.append(f"tur-operation-areas.geojson: {len(feats)} features, {total} vertices")
    if args.preview:
        preview(args.preview, final, cfg, adm3, syria, args.cache)
    print("\n".join(report))


if __name__ == "__main__":
    main()
