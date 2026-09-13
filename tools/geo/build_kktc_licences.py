#!/usr/bin/env python3
"""KKTC (TRNC) offshore licence areas A–G and the merged Türkiye + KKTC Eastern Mediterranean area.

Source (the only coordinate source used here):
  KKTC Bakanlar Kurulu Kararı K(II)1195-2011 "Türkiye Petrolleri Anonim Ortaklığı (TPAO)'nın
  Ruhsat Talebi", 22.9.2011 — KKTC Resmî Gazete Sayı 161, 22 Eylül 2011, EK IV Bölüm I,
  pp. 1063–1066, tables AR/KKTC/A … AR/KKTC/G (corner number, latitude, longitude, X, Y).
  The tables are transcribed verbatim in tools/geo/kktc_licences.csv.

Datum. The gazette does not name a datum. Its X/Y columns are ED50 / UTM zone 36N (EPSG:23036)
grid coordinates of the same corners: every transcribed latitude/longitude reproduces the printed
X/Y to < 1 m when read as ED50, and is off by ~60 m when read as WGS84 (checked by grid_check()).
The corners are therefore ED50 geographic coordinates and are converted to WGS84 with the EPSG
transformation named in TRANSFORM_NAME. The check doubles as a transcription check: a misread
digit in either the angle or the grid columns shows up as a residual of metres to kilometres.

Processing:
  * one Polygon per table, corners in the published order (validity asserted);
  * land removed: Natural Earth 10m land, grown by LAND_GAP_M and simplified with LAND_TOL_M
    (metric LAEA), so the clipped blocks stay off land while the published sea corners stay exact;
  * 1e-4° grid (4 decimals), exterior rings clockwise (d3-geo convention, as the schematic areas);
  * KKTC territorial sea (schematic, kktc_territorial_sea()): 12 nm from the Natural Earth 10m
    'N. Cyprus' coast, split from waters nearer the rest of the island by a Voronoi equidistance line;
  * merged area: union of `tur-med-schematic`, the seven clipped blocks and that territorial sea; slivers narrower than
    2 × MERGE_CLOSE_M between the two (datum offset of the A/74/550 section A line as drawn on the
    site, block B's chord under A/74/550 point 5) are filled near the blocks only, then land removed.

Usage:
  python tools/geo/build_kktc_licences.py [--cache DIR]   # rewrites the kktc-licence-* and
      tur-kktc-med-merged features in apps/web/assets/data/maritime-tur.geojson, keeps the rest
  (build_maritime.py and build_maritime_schematic.py call build()/merged_feature() as well.)

Dependencies: shapely>=2.1, pyproj>=3.6 (plus what build_maritime / build_maritime_schematic need).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import tempfile
from pathlib import Path

import numpy as np
import shapely
from pyproj import Geod, Transformer
from pyproj.aoi import AreaOfInterest
from pyproj.transformer import TransformerGroup
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_maritime as bm  # noqa: E402
import build_maritime_schematic as bms  # noqa: E402  (to_m / to_deg / geojson_geom / parts)

CSV_PATH = HERE / "kktc_licences.csv"

# --------------------------------------------------------------------------------------
# Sources
# --------------------------------------------------------------------------------------
RG = "https://basimevi.gov.ct.tr/Portals/6/"
RG_2011_161 = RG + "2011/161.pdf"      # K(II)1195-2011, licence + coordinate tables
RG_2011_198 = RG + "2011/198.pdf"      # K(II)1571-2011, production-sharing agreement approved
RG_2017_182 = RG + "2017/182.pdf"      # H(K-I)2820-2017, agreement art. 1 amendment approved
RG_2023_219 = RG + "2023/219.pdf"      # Ö(K-I)1610-2023, exploration licence extended six years
RG_ARCHIVE_2011 = "https://basimevi.gov.ct.tr/AR%C5%9E%C4%B0V/2011"
TPAO_KKTC = "https://www.tpao.gov.tr/kktc"
DECISION = "K(II)1195-2011"
GAZETTE_TR = "KKTC Resmî Gazete Sayı 161 (22 Eylül 2011), EK IV Bölüm I (Sayı 105), s. 1063–1066"
GAZETTE_EN = "TRNC Official Gazette No. 161 (22 September 2011), Annex IV Part I (No. 105), pp. 1063–1066"

# --------------------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------------------
SRC_GEOG, GRID_CRS, DST_GEOG = "EPSG:4230", "EPSG:23036", "EPSG:4326"   # ED50, ED50/UTM 36N, WGS84
TRANSFORM_NAME = "ED50 to WGS 84 (4)"
AOI = AreaOfInterest(32.0, 33.0, 35.2, 36.1)
MAX_GRID_RESIDUAL_M = 1.0
LAND_GAP_M, LAND_TOL_M = 150.0, 100.0
MERGE_CLOSE_M = 300.0
MERGE_NEAR_M = 3000.0
MERGE_VERTEX_BUDGET = 1500
# KKTC territorial sea (schematic construction for the merged area only)
TS_M = 12 * 1852.0                    # 12 nm from the KKTC coast
TS_DENSIFY_M = 200.0                  # coast sampling for the equidistance (Voronoi) split
TS_LAND_GAP_M, TS_LAND_TOL_M = 50.0, 40.0
KKTC_A3 = "CYN"                       # Natural Earth 10m admin-0 "N. Cyprus"
OTHER_CY_A3 = ("CYP", "CNM", "ESB", "WSB")   # Cyprus (GKRY), UN buffer zone, Dhekelia, Akrotiri
CY_AEQD = "+proj=aeqd +lat_0=35.2 +lon_0=33.4 +ellps=WGS84 +units=m +no_defs"
_CY_FWD = Transformer.from_crs("EPSG:4326", CY_AEQD, always_xy=True)
_CY_INV = Transformer.from_crs(CY_AEQD, "EPSG:4326", always_xy=True)


def cy_m(g):
    """WGS84 lon/lat → azimuthal equidistant metres centred on Cyprus (scale error < 1e-4 within 200 km)."""
    return shapely.transform(g, lambda xy: np.column_stack(_CY_FWD.transform(xy[:, 0], xy[:, 1])))


def cy_deg(g):
    return shapely.transform(g, lambda xy: np.column_stack(_CY_INV.transform(xy[:, 0], xy[:, 1])))
BLOCKS = "ABCDEFG"
LOCATION = {  # where each table's polygon lies relative to the island — this project's description, not the gazette's
    "A": ("Kıbrıs'ın kuzeybatısı", "north-west of Cyprus"),
    "B": ("Kıbrıs'ın kuzeybatısı (Güzelyurt Körfezi ve Koruçam Burnu açığı)", "north-west of Cyprus (Morphou Bay and off Cape Kormakitis)"),
    "C": ("Kıbrıs'ın kuzeyi (Girne açığı)", "north of Cyprus (off Kyrenia)"),
    "D": ("Kıbrıs'ın kuzeydoğusu (Karpaz açığı)", "north-east of Cyprus (off Karpas)"),
    "E": ("Kıbrıs'ın doğusu (Gazimağusa açığı)", "east of Cyprus (off Famagusta)"),
    "F": ("Kıbrıs'ın güneyi", "south of Cyprus"),
    "G": ("Kıbrıs'ın güneyi (açık deniz)", "south of Cyprus (offshore)"),
}
GEOD = Geod(ellps="WGS84")


def geod_km2(g) -> float:
    return abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6


def transformer_ed50_wgs84():
    tg = TransformerGroup(SRC_GEOG, DST_GEOG, always_xy=True, area_of_interest=AOI)
    matches = [t for t in tg.transformers if t.description.split(" (with")[0] == TRANSFORM_NAME]
    assert matches, f"{TRANSFORM_NAME} not available: {[t.description for t in tg.transformers]}"
    return matches[0]


def load_rows(path: Path = CSV_PATH) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(line for line in fh if not line.startswith("#")))
    for r in rows:
        r["lon_ed50"], r["lat_ed50"] = bm.ll(r["lat_dms"], r["lon_dms"])
        r["x_north"], r["y_east"] = float(r["x_north"]), float(r["y_east"])
    assert sorted({r["block"] for r in rows}) == list(BLOCKS)
    return rows


def grid_check(rows, report):
    """Published lat/lon vs published X/Y: decides the datum and checks the transcription."""
    out = {}
    for label, geog, grid in (("ED50", SRC_GEOG, GRID_CRS), ("WGS84", DST_GEOG, "EPSG:32636")):
        t = Transformer.from_crs(geog, grid, always_xy=True)
        e, n = t.transform([r["lon_ed50"] for r in rows], [r["lat_ed50"] for r in rows])
        d = np.column_stack([np.asarray(n) - [r["x_north"] for r in rows], np.asarray(e) - [r["y_east"] for r in rows]])
        out[label] = d
        report.append(f"KKTC grid check, lat/lon read as {label} → UTM 36N minus printed X/Y: mean dN {d[:, 0].mean():+.1f} m, "
                      f"dE {d[:, 1].mean():+.1f} m; max |residual| {np.hypot(*d.T).max():.2f} m")
    worst = np.hypot(*out["ED50"].T)
    assert worst.max() < MAX_GRID_RESIDUAL_M, [(r["block"], r["vertex"], round(w, 2)) for r, w in zip(rows, worst) if w >= MAX_GRID_RESIDUAL_M]
    return float(worst.max())


def section_a_offsets(rows, report):
    """Corners that repeat A/74/550 section A points (the 2011 Türkiye–KKTC line)."""
    sec_a = [bm.ll(la, lo) for la, lo in bm.A74550_A]
    hits = []
    for r in rows:
        p = Point(r["lon_ed50"], r["lat_ed50"])
        d = min(bm.metres(p, Point(q)) for q in sec_a)
        if d < 5:
            hits.append((r["block"], int(r["vertex"]), d))
    report.append(f"KKTC: {len(hits)} corners repeat A/74/550 section A points (same numbers, max {max(h[2] for h in hits):.2f} m): "
                  + ", ".join(f"{b}{v}" for b, v, _ in hits))
    return hits


def land_mask(land, bounds):
    local = land.intersection(box(bounds[0] - 0.3, bounds[1] - 0.3, bounds[2] + 0.3, bounds[3] + 0.3))
    return bms.to_deg(bms.to_m(local).buffer(LAND_GAP_M, quad_segs=4).simplify(LAND_TOL_M))


def round_orient(g):
    g = shapely.set_precision(g, 1e-4)
    g = unary_union([p for p in bms.parts(g) if p.geom_type == "Polygon"])
    return shapely.orient_polygons(g, exterior_cw=True)


def build_blocks(rows, land, report):
    t = transformer_ed50_wgs84()
    report.append(f"KKTC: ED50 → WGS84 with EPSG '{TRANSFORM_NAME}' ({t.description.split(' (with')[0]}; "
                  f"accuracy {t.accuracy} m)")
    raw, ed50 = {}, {}
    for b in BLOCKS:
        pts = [r for r in rows if r["block"] == b]
        assert [int(r["vertex"]) for r in pts] == list(range(1, len(pts) + 1)), b
        ed50[b] = Polygon([(r["lon_ed50"], r["lat_ed50"]) for r in pts])
        raw[b] = Polygon([t.transform(r["lon_ed50"], r["lat_ed50"]) for r in pts])
        assert raw[b].is_valid, (b, shapely.is_valid_reason(raw[b]))
    shift = [bm.metres(Point(ed50[b].exterior.coords[0]), Point(raw[b].exterior.coords[0])) for b in BLOCKS]
    report.append(f"KKTC: datum shift ED50 → WGS84 at the corners {min(shift):.0f}–{max(shift):.0f} m")
    # Neighbouring blocks share corners/edges; only floating-point noise may overlap (< 100 m²).
    worst_ov = 0.0
    for a in BLOCKS:
        for b in BLOCKS:
            if a < b:
                i = raw[a].intersection(raw[b])
                ov = geod_km2(i) * 1e6 if not i.is_empty and i.area > 0 else 0.0
                assert ov < 100.0, f"blocks {a} and {b} overlap ({ov:.0f} m²)"
                worst_ov = max(worst_ov, ov)
    report.append(f"KKTC: blocks do not overlap (largest shared-edge float overlap {worst_ov:.1f} m²)")
    mask = land_mask(land, unary_union(list(raw.values())).bounds)
    out = {}
    for b in BLOCKS:
        g = raw[b].difference(mask)
        g = round_orient(g)
        assert g.is_valid and not g.is_empty, b
        for p in bms.parts(g):
            assert not p.exterior.is_ccw and all(r.is_ccw for r in p.interiors)
        overlap = g.intersection(land)
        out[b] = {
            "geom": g, "raw": raw[b], "n": len(raw[b].exterior.coords) - 1,
            "km2": geod_km2(g), "km2_raw": geod_km2(raw[b]), "land_km2": geod_km2(raw[b].intersection(land)),
        }
        report.append(f"KKTC {b}: {out[b]['n']} corners; published polygon {out[b]['km2_raw']:,.0f} km², "
                      f"of which NE 10m land {out[b]['land_km2']:.1f} km²; clipped {out[b]['km2']:,.0f} km², "
                      f"{bm.nverts(g)} vertices, {len(bms.parts(g))} part(s); remaining land overlap {overlap.area:.1e} deg²")
    union = unary_union([v["raw"] for v in out.values()])
    report.append(f"KKTC: seven blocks, published total {geod_km2(union):,.0f} km², contiguous parts "
                  f"{len(bms.parts(union))}, clipped total {sum(v['km2'] for v in out.values()):,.0f} km²")
    return out, t


def edge_to_line_offsets(rows, blocks, t, report):
    """Relation of the blocks' northern edges to the A/74/550 section A line.

    (a) corners that repeat section A points: distance of the converted (WGS84) corner from the
        site's line, which uses the A/74/550 numbers as WGS84 — i.e. the datum question;
    (b) block B's northern edge B4→B1 is a chord between two points ON section A (segments 4–5
        and 5–6), so it passes south of section A point 5 (same datum, no conversion involved).
    """
    line = LineString([bm.ll(la, lo) for la, lo in bm.A74550_A])
    d = []
    for r in rows:
        p_ed50 = Point(r["lon_ed50"], r["lat_ed50"])
        if bm.metres(p_ed50, line) < 5:
            d.append(bm.metres(Point(t.transform(r["lon_ed50"], r["lat_ed50"])), line))
    report.append(f"KKTC: {len(d)} corners lie on A/74/550 section A (ED50 numbers); after conversion to WGS84 they lie "
                  f"{min(d):.0f}–{max(d):.0f} m from the site's section A line (which reads the same numbers as WGS84)")
    b = {int(r["vertex"]): Point(r["lon_ed50"], r["lat_ed50"]) for r in rows if r["block"] == "B"}
    chord = LineString([b[4], b[1]])
    pt5 = Point(bm.ll(*bm.A74550_A[4]))
    report.append(f"KKTC B: corners B4 and B1 lie on section A ({bm.metres(b[4], line):.1f} m, {bm.metres(b[1], line):.1f} m); "
                  f"the chord B4→B1 passes {bm.metres(pt5, chord):.0f} m south of section A point 5")


def licence_features(blocks, t, grid_resid) -> list[dict]:
    feats = []
    for b in BLOCKS:
        v = blocks[b]
        where_tr, where_en = LOCATION[b]
        overlap_tr = overlap_en = ""
        props = {
            "id": f"kktc-licence-{b}",
            "name_tr": f"KKTC ruhsat sahası {b} (AR/KKTC/{b}) — TPAO petrol ve doğal gaz arama ruhsatı",
            "name_en": f"TRNC licence area {b} (AR/KKTC/{b}) — TPAO oil and gas exploration licence",
            "location_tr": where_tr,
            "location_en": where_en,
            "status": "licence",
            "kind": "kktc-licence",
            "licence_ref": f"AR/KKTC/{b}",
            "licensee": "TPAO",
            "decision": DECISION,
            "granted": "2011-09-22",
            "basis_tr": ("KKTC Bakanlar Kurulu'nun 22.9.2011 tarihli K(II)1195-2011 sayılı kararı: TPAO'ya ekte sunulan saha "
                         f"tarifleri alanlarında petrol ve doğal gaz araştırma ruhsatı verildi ({GAZETTE_TR}, AR/KKTC/{b} "
                         "tablosu). TPAO ile KKTC arasındaki Petrol Sahası Hizmetleri ve Üretim Paylaşımı Sözleşmesi "
                         "K(II)1571-2011 sayılı kararla onaylandı (Resmî Gazete Sayı 198, 23.11.2011); arama ruhsatı "
                         "süresi Ö(K-I)1610-2023 sayılı kararla 11.11.2023'ten itibaren altı yıl uzatıldı. Türkiye ve "
                         "KKTC'nin tutumuna göre Kıbrıs Türkleri adanın doğal kaynakları üzerinde eşit haklara sahiptir." + overlap_tr),
            "basis_en": ("TRNC Council of Ministers decision K(II)1195-2011 of 22 September 2011 granting TPAO an oil and gas "
                         f"exploration licence in the annexed areas ({GAZETTE_EN}, table AR/KKTC/{b}). The TPAO–TRNC "
                         "Petroleum Field Services and Production Sharing Agreement was approved by decision K(II)1571-2011 "
                         "(Official Gazette No. 198, 23 Nov 2011); the exploration licence was extended by six years from "
                         "11 Nov 2023 by decision Ö(K-I)1610-2023. In Türkiye's and the TRNC's position, Turkish Cypriots have "
                         "equal rights over the island's natural resources." + overlap_en),
            "position_tr": "KKTC'nin ve Türkiye'nin tutumu",
            "position_en": "The TRNC's and Türkiye's position",
            "contested": True,
            "contested_by": ["CYP (GKRY)", "Greece"],
            "datum_source": ("ED50 (not stated in the gazette; its X/Y columns are ED50 / UTM zone 36N grid coordinates of "
                             f"the same corners and match the latitudes/longitudes to ≤ {grid_resid:.1f} m)"),
            "datum_transformation": f"{TRANSFORM_NAME} (EPSG), accuracy {t.accuracy} m",
            "corners_published": v["n"],
            "area_km2": round(v["km2"]),
            "area_published_km2": round(v["km2_raw"]),
            "method_tr": (f"Köşeler Resmî Gazete tablosundan harfiyen aktarıldı (tools/geo/kktc_licences.csv), ED50'den "
                          f"WGS84'e dönüştürüldü ({TRANSFORM_NAME}); kara (Natural Earth 10m, {LAND_GAP_M:g} m geri çekilerek) "
                          f"çıkarıldı ({v['land_km2']:.1f} km²); 4 ondalık."),
            "method_en": (f"Corners transcribed verbatim from the gazette table (tools/geo/kktc_licences.csv), converted "
                          f"from ED50 to WGS84 ({TRANSFORM_NAME}); land (Natural Earth 10m, set back {LAND_GAP_M:g} m) "
                          f"removed ({v['land_km2']:.1f} km²); 4 decimals."),
            "sources": [RG_2011_161, RG_ARCHIVE_2011, RG_2011_198, RG_2023_219, RG_2017_182, TPAO_KKTC, bm.NE_LAND],
        }
        feats.append({"type": "Feature", "properties": props, "geometry": bms.geojson_geom(v["geom"])})
    return feats


def kktc_territorial_sea(cache: Path, land, report: list[str]):
    """Schematic KKTC territorial sea: 12 nm from the Natural Earth 10m 'N. Cyprus' coast, split from the
    waters nearer the rest of the island's coast (Cyprus/GKRY, UN buffer zone, SBAs) by an equidistance
    line (Voronoi over coast points every TS_DENSIFY_M), minus generalised land.

    Returns (kktc_ts, other_ts, info): both in WGS84 degrees; other_ts is the 12-nm belt nearer the
    non-KKTC coast, used only as a guard (nothing may be added there)."""
    C = bms.load_countries(cache)
    cyn = C[KKTC_A3]
    oth = unary_union([C[k] for k in OTHER_CY_A3])
    cyn_m, oth_m = cy_m(cyn), cy_m(oth)
    border = cyn_m.boundary.intersection(oth_m.buffer(50.0))          # Green Line / buffer-zone edge
    k_coast = cyn_m.boundary.difference(oth_m.buffer(50.0))
    o_coast = oth_m.boundary.difference(cyn_m.buffer(50.0))

    def pts(line):
        return np.unique(np.round(shapely.get_coordinates(shapely.segmentize(line, TS_DENSIFY_M)), 1), axis=0)

    kp, op = pts(k_coast), pts(o_coast)
    allp = np.vstack([kp, op])
    lab = np.r_[np.ones(len(kp), bool), np.zeros(len(op), bool)]
    allp, idx = np.unique(allp, axis=0, return_index=True)
    lab = lab[idx]
    env = box(*cyn_m.buffer(TS_M + 30000.0).bounds)
    cells = shapely.voronoi_polygons(shapely.multipoints(allp), extend_to=env, ordered=True)
    cells = list(cells.geoms)
    assert len(cells) == len(allp)
    nearer_k = unary_union([c for c, is_k in zip(cells, lab) if is_k]).intersection(env)
    ts_m = cyn_m.buffer(TS_M, quad_segs=32).intersection(nearer_k)
    other_m = oth_m.buffer(TS_M, quad_segs=32).difference(nearer_k)

    all_cy = unary_union([land, cyn, oth])
    mask = bms.to_deg(bms.to_m(all_cy.intersection(box(31.5, 33.8, 35.5, 36.5)))
                      .buffer(TS_LAND_GAP_M, quad_segs=4).simplify(TS_LAND_TOL_M))
    ts = cy_deg(ts_m).difference(mask)
    ts = unary_union([p for p in bms.parts(ts) if p.geom_type == "Polygon" and geod_km2(p) >= 0.05])
    other_ts = cy_deg(other_m).difference(all_cy)

    # Coastal termini of the land border and an equidistance spot check along the split line.
    ends = [Point(c) for c in shapely.get_coordinates(border)
            if k_coast.distance(Point(c)) < 100 and o_coast.distance(Point(c)) < 100]
    termini = []
    for p in sorted(ends, key=lambda q: q.x):
        if all(p.distance(t) > 5000 for t in termini):
            termini.append(p)
    divide = nearer_k.boundary.intersection(cyn_m.buffer(TS_M - 10.0)).difference(unary_union([cyn_m, oth_m]).buffer(500.0))
    samples = [divide.interpolate(d) for d in np.arange(0.0, divide.length, 1000.0)] if not divide.is_empty else []
    dmax = max((abs(k_coast.distance(s) - o_coast.distance(s)) for s in samples), default=float("nan"))
    t_txt = "; ".join(f"{q.y:.4f}N {q.x:.4f}E" for q in (cy_deg(p) for p in termini))
    info = {"km2": geod_km2(ts), "parts": len(bms.parts(ts)), "termini": t_txt, "divide_km": divide.length / 1000,
            "dmax": dmax, "n_k": len(kp), "n_o": len(op)}
    report.append(f"KKTC territorial sea (schematic): 12 nm from NE 10m 'N. Cyprus' coast ({len(kp)} coast points every "
                  f"{TS_DENSIFY_M:g} m vs {len(op)} on the rest of the island); land-border coastal termini {t_txt}; "
                  f"equidistance split {divide.length / 1000:.1f} km long, max |d_KKTC − d_other| {dmax:.0f} m at 1-km samples; "
                  f"{info['parts']} part(s), {info['km2']:,.0f} km² (land set back {TS_LAND_GAP_M:g} m)")
    return ts, other_ts, info


def merged_feature(med_geom, block_geoms, land, report, cache: Path) -> dict:
    """Union of tur-med-schematic, the licence blocks and the schematic KKTC territorial sea (dissolved)."""
    ts, other_ts, ts_info = kktc_territorial_sea(cache, land, report)
    blocks_u = unary_union(block_geoms)
    core = unary_union([blocks_u, ts])
    u = unary_union([med_geom, core])
    um = bms.to_m(u)
    closed = um.buffer(MERGE_CLOSE_M, quad_segs=8).buffer(-MERGE_CLOSE_M, quad_segs=8)
    fill = closed.difference(um).intersection(bms.to_m(core).buffer(MERGE_NEAR_M))
    fill_deg = bms.to_deg(fill).difference(land).difference(other_ts)     # never add GKRY-side 12 nm
    g = unary_union([u, fill_deg]).difference(land)
    # Holes that tur-med-schematic did not have (they are enclosed only because of the merge): the
    # parts of the Cyprus 12-nm territorial-sea cut-out that lie north of the 2011 line off the TRNC
    # coast. Waters off the TRNC coast are not "foreign" to a combined Türkiye + TRNC position, so
    # these are filled; holes that already exist in tur-med-schematic (Greek islands' TS) are kept.
    med_holes = unary_union([Polygon(r) for p in bms.parts(med_geom) for r in p.interiors])
    kept, filled, refused = [], [], []
    for p in bms.parts(g):
        keep_rings = []
        for r in p.interiors:
            hp = Polygon(r)
            if med_holes.contains(hp.representative_point()):
                keep_rings.append(r)
            elif hp.intersection(other_ts).area > 0.01 * hp.area:      # would add GKRY-side 12 nm: keep open
                keep_rings.append(r); refused.append(r)
            else:
                filled.append(r)
        kept.append(Polygon(p.exterior, keep_rings))
    g = unary_union(kept).difference(land)
    added_gk = g.intersection(other_ts).difference(unary_union([med_geom, blocks_u]).buffer(1e-4))
    assert geod_km2(added_gk) < 0.5 if not added_gk.is_empty else True, f"GKRY-side 12 nm added: {geod_km2(added_gk):.2f} km²"
    if refused:
        report.append(f"Merged Türkiye+KKTC: {len(refused)} hole(s) left open because they lie in the GKRY-side 12 nm")
    report.append(f"Merged Türkiye+KKTC: filled {len(filled)} hole(s) created by the merge "
                  f"({', '.join(f'{geod_km2(Polygon(r)):.1f} km² at {Polygon(r).centroid.y:.3f}N {Polygon(r).centroid.x:.3f}E' for r in filled)})")
    g = round_orient(g)
    assert g.is_valid, shapely.is_valid_reason(g)
    for p in bms.parts(g):
        assert not p.exterior.is_ccw and all(r.is_ccw for r in p.interiors)
    n = bm.nverts(g)
    assert n <= MERGE_VERTEX_BUDGET, n
    # nothing of the inputs may be lost by rounding/filling beyond grid noise
    lost = unary_union([med_geom, blocks_u]).difference(g.buffer(2e-4)).area
    assert lost < 1e-9, lost
    holes = sum(len(p.interiors) for p in bms.parts(g))
    ts_new = ts.difference(unary_union([med_geom, blocks_u]))
    report.append(f"Merged Türkiye+KKTC: {len(bms.parts(g))} parts, {holes} holes, {n} vertices, {geod_km2(g):,.0f} km² "
                  f"(tur-med-schematic {geod_km2(med_geom):,.0f} km² + blocks {geod_km2(blocks_u):,.0f} km², overlap "
                  f"{geod_km2(med_geom.intersection(blocks_u)):,.1f} km²; KKTC territorial sea {ts_info['km2']:,.0f} km², of which "
                  f"{geod_km2(ts_new):,.0f} km² outside the other components); slivers filled {fill.area / 1e6:.1f} km²; "
                  f"overlap with NE 10m land {g.intersection(land).area:.1e} deg²")
    props = {
        "id": "tur-kktc-med-merged",
        "name_tr": "Doğu Akdeniz: Türkiye + KKTC birleşik deniz yetki alanı (şematik)",
        "name_en": "Eastern Mediterranean: combined Türkiye + TRNC maritime area (schematic)",
        "status": "schematic",
        "basis_tr": ("ŞEMATİK ALAN — Türkiye'nin ve KKTC'nin birlikte tutumunu tek bir dolgu olarak gösterir. Üç bileşenin "
                     "birleşimidir: (1) `tur-med-schematic` (Türkiye'nin A/74/550 ve Türkiye–Libya Mutabakatı'na dayanan "
                     "şematik alanı; resmî koordinat değildir), (2) KKTC'nin TPAO'ya verdiği A–G deniz ruhsat sahaları "
                     f"(resmî koordinatlar: {GAZETTE_TR}, karar {DECISION}) ve (3) KKTC kıyısından ölçülen 12 deniz millik "
                     "karasuları (bu projenin yapısı, şematik; resmî koordinat değildir). KKTC'nin kendi ilan ettiği bir MEB veya kıta "
                     "sahanlığı dış sınırı yoktur; ruhsat sahaları KKTC'nin yetki iddiasını gösteren resmî alanlardır. "
                     "Türkiye ve KKTC'nin tutumuna göre Kıbrıs Türkleri adanın doğal kaynakları üzerinde eşit haklara "
                     "sahiptir. GKRY, Yunanistan ve Mısır bu tutuma itiraz etmektedir."),
        "basis_en": ("SCHEMATIC AREA — shows the combined Türkiye + TRNC position as a single fill. It is the union of (1) "
                     "`tur-med-schematic` (Türkiye's schematic area based on A/74/550 and the Türkiye–Libya MoU; not "
                     "official coordinates), (2) the TRNC's offshore licence areas A–G granted to TPAO (official "
                     f"coordinates: {GAZETTE_EN}, decision {DECISION}) and (3) a 12-nautical-mile territorial sea measured "
                     "from the TRNC coast (this project's construction, schematic; not official coordinates). The TRNC has "
                     "not declared an EEZ or continental-shelf "
                     "outer limit of its own; the licence areas are the official areas through which it asserts "
                     "jurisdiction. In Türkiye's and the TRNC's position, Turkish Cypriots have equal rights over the "
                     "island's natural resources. The Greek Cypriot Administration, Greece and Egypt contest this position."),
        "method_tr": ("KKTC karasuları (ŞEMATİK — bu projenin yapısıdır, resmî koordinat değildir): Natural Earth 10m "
                      "admin-0 'N. Cyprus' poligonunun (Erenköy/Kokkina dahil) kıyısından 12 deniz mili, Kıbrıs merkezli "
                      "azimut eşit uzaklık izdüşümünde ölçüldü (normal esas hat). Adanın geri kalanının (GKRY, BM ara "
                      "bölgesi, İngiliz üsleri) kıyısına daha yakın sular, iki kıyı arasındaki eşit uzaklık hattıyla "
                      f"ayrıldı (kıyılar {TS_DENSIFY_M:g} m aralıkla örneklendi, Voronoi); hat Yeşilırmak/Lefke, Erenköy "
                      f"ve Mağusa/Derinya yakınındaki kara sınırı uçlarından başlar. Kara {TS_LAND_GAP_M:g} m geri "
                      f"çekilerek çıkarıldı. KKTC karasuları {ts_info['km2']:,.0f} km²; bunun {geod_km2(ts_new):,.0f} km²'si "
                      "diğer bileşenlerin dışındaydı. GKRY tarafının 12 dm'si ve Yunan adalarının karasuları delikleri "
                      "değiştirilmedi; aşağıdaki dolgular oraya hiçbir alan eklemez. Ardından üç bileşen birleştirildi "
                      "(dissolve). Bileşenler arasındaki, 2 × "
                      f"{MERGE_CLOSE_M:g} m'den dar şeritler yalnızca ruhsat sahalarının ve KKTC karasularının {MERGE_NEAR_M / 1000:g} km "
                      "yakınında dolduruldu (morfolojik kapama): bunlar ED50 → WGS84 dönüşümü nedeniyle sahaların kuzey "
                      "kenarı ile sitedeki A/74/550 bölüm A çizgisi arasındaki ~100 m'lik fark ve B sahasının kuzey kenarının "
                      "A/74/550 5. noktasının altından geçen kirişidir. Birleşim sonucu kapanan ve `tur-med-schematic`'te "
                      "bulunmayan delikler (Karpaz açığında, 2011 hattının kuzeyinde kalan Kıbrıs 12 dm karasuları "
                      "kesiti) dolduruldu: Türkiye + KKTC birleşik tutumunda KKTC kıyısı açığındaki sular 'yabancı' "
                      "değildir. Yunan adalarının karasuları delikleri korundu. Ardından kara (Natural Earth 10m) "
                      "çıkarıldı; 1e-4° ızgara, dış halka saat yönünde."),
        "method_en": ("TRNC territorial sea (SCHEMATIC — this project's construction, not official coordinates): 12 "
                      "nautical miles from the coast of the Natural Earth 10m admin-0 'N. Cyprus' polygon (incl. the "
                      "Erenköy/Kokkina exclave), measured in an azimuthal equidistant projection centred on Cyprus "
                      "(normal baseline). Waters nearer the coast of the rest of the island (Greek Cypriot "
                      "Administration, UN buffer zone, British Sovereign Base Areas) are split off by an equidistance "
                      f"line between the two coasts (coasts sampled every {TS_DENSIFY_M:g} m, Voronoi); it starts at the "
                      "coastal ends of the land border near Yeşilırmak/Lefke, Erenköy and Mağusa/Deryneia. Land is "
                      f"removed with a {TS_LAND_GAP_M:g} m set-back. The territorial sea is {ts_info['km2']:,.0f} km², of "
                      f"which {geod_km2(ts_new):,.0f} km² lay outside the other components. The Greek Cypriot side's 12 nm "
                      "and the Greek islands' territorial-sea holes are unchanged; none of the fills below adds area "
                      "there. The three components are then dissolved into one. Slivers narrower than 2 × "
                      f"{MERGE_CLOSE_M:g} m between them are filled only within {MERGE_NEAR_M / 1000:g} km of the licence "
                      "areas and the territorial sea (morphological closing): they are the ~100 m offset between the blocks' northern edges "
                      "(converted from ED50 to WGS84) and the A/74/550 section A line as drawn on the site, and block B's "
                      "northern edge, a chord that passes under A/74/550 point 5. Holes closed by the merge that "
                      "`tur-med-schematic` does not have (the part of the Cyprus 12-nm territorial-sea cut-out north of "
                      "the 2011 line off Karpas) are filled: in a combined Türkiye + TRNC position the waters off the "
                      "TRNC coast are not 'foreign'. The Greek islands' territorial-sea holes are kept. Land (Natural "
                      "Earth 10m) is then removed; 1e-4° grid, exterior rings clockwise."),
        "position_tr": "Türkiye'nin ve KKTC'nin tutumu",
        "position_en": "Türkiye's and the TRNC's position",
        "contested": True,
        "contested_by": ["CYP (GKRY)", "Greece", "Egypt"],
        "attribution": ("Marine Regions (VLIZ) — Cypriot 12 NM, IHO Sea Areas — © Flanders Marine Institute, CC BY 4.0; "
                        "coastlines: Natural Earth (public domain)"),
        "components": (["tur-med-schematic"] + [f"kktc-licence-{b}" for b in BLOCKS]
                       + ["KKTC 12-nm territorial sea (schematic construction, not a separate feature)"]),
        "kktc_territorial_sea_km2": round(ts_info["km2"]),
        "kktc_territorial_sea_added_km2": round(geod_km2(ts_new)),
        "sources": [bm.UNDOC + "A/74/550", bm.UNDOC + "A/74/757", RG_2011_161, RG_2011_198, RG_2023_219,
                    bm.MR_LICENCE, bm.NE_LAND, bms.NE_COUNTRIES],
    }
    return {"type": "Feature", "properties": props, "geometry": bms.geojson_geom(g)}


def build(cache: Path, land, report: list[str], maritime: list[dict]) -> list[dict]:
    """Licence features + merged feature; `maritime` must contain tur-med-schematic for the merge."""
    rows = load_rows()
    resid = grid_check(rows, report)
    section_a_offsets(rows, report)
    blocks, t = build_blocks(rows, land, report)
    edge_to_line_offsets(rows, blocks, t, report)
    feats = licence_features(blocks, t, resid)
    med = next((f for f in maritime if f["properties"]["id"] == "tur-med-schematic"), None)
    if med is not None:
        feats.append(merged_feature(shape(med["geometry"]), [shape(f["geometry"]) for f in feats], land, report, cache))
    else:
        report.append("Merged Türkiye+KKTC: skipped (no tur-med-schematic feature)")
    return feats


def is_kktc(f) -> bool:
    p = f["properties"]
    return p.get("kind") == "kktc-licence" or p.get("id") == "tur-kktc-med-merged"


def preview(png: Path, cache: Path, land, feats: list[dict]):
    """Cyprus close-up: merged area, licence outlines, the schematic KKTC territorial sea."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path as MPath

    def patch(ax, g, **kw):
        for p in bms.parts(g):
            rings = [p.exterior] + list(p.interiors)
            verts = [c for r in rings for c in r.coords]
            codes = [c for r in rings for c in [MPath.MOVETO] + [MPath.LINETO] * (len(r.coords) - 1)]
            ax.add_patch(PathPatch(MPath(verts, codes), **kw))

    ts, other_ts, _ = kktc_territorial_sea(cache, land, [])
    fig, ax = plt.subplots(figsize=(11, 7.5), dpi=110)
    frame = box(31.4, 33.0, 36.4, 36.6)
    patch(ax, land.intersection(frame), fc="#d9d6cf", ec="#9a968d", lw=0.3)
    merged = next(shape(f["geometry"]) for f in feats if f["properties"]["id"] == "tur-kktc-med-merged")
    patch(ax, merged.intersection(frame), fc="#0e7490", alpha=0.25, ec="#0e7490", lw=0.6)
    patch(ax, ts, fc="none", ec="#0e7490", lw=0.8, hatch="xxx", alpha=0.6)
    patch(ax, other_ts.intersection(frame), fc="none", ec="#6b7280", lw=0.6, ls=":")
    for f in feats:
        if f["properties"].get("kind") == "kktc-licence":
            g = shape(f["geometry"])
            ax.plot(*g.exterior.xy, "--", color="#b45309", lw=1.0)
            c = g.representative_point()
            ax.annotate(f["properties"]["licence_ref"][-1], (c.x, c.y), color="#b45309", fontsize=9, ha="center")
    ax.set_xlim(frame.bounds[0], frame.bounds[2]); ax.set_ylim(frame.bounds[1], frame.bounds[3])
    ax.set_aspect(1 / math.cos(math.radians(35.0))); ax.grid(lw=0.2)
    ax.set_title("tur-kktc-med-merged (teal) — licence areas A–G (brown dashed, official) — KKTC 12-nm territorial sea "
                 "(cross-hatched, schematic) — GKRY-side 12 nm (grey dotted, excluded)", fontsize=8)
    fig.tight_layout(); fig.savefig(png); plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "gt-geo-cache")
    ap.add_argument("--out", type=Path, default=bm.OUT)
    ap.add_argument("--preview", type=Path, help="write a Cyprus close-up PNG")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    path = args.out / "maritime-tur.geojson"
    fc = json.loads(path.read_text(encoding="utf-8"))
    report: list[str] = []
    land = bm.load_land(args.cache)
    keep = [f for f in fc["features"] if not is_kktc(f)]
    feats = keep + build(args.cache, land, report, keep)
    meta = {k: v for k, v in fc.items() if k not in ("type", "features")}
    meta["description"] = bm.META_DESCRIPTION
    bm.write_fc(path, feats, meta)
    if args.preview:
        preview(args.preview, args.cache, land, feats)
    print("\n".join(report))


if __name__ == "__main__":
    main()
