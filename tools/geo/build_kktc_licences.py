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
  * merged area: union of `tur-med-schematic` and the seven clipped blocks; slivers narrower than
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


def merged_feature(med_geom, block_geoms, land, report) -> dict:
    """Union of tur-med-schematic and the licence blocks (schematic, dissolved)."""
    blocks_u = unary_union(block_geoms)
    u = unary_union([med_geom, blocks_u])
    um = bms.to_m(u)
    closed = um.buffer(MERGE_CLOSE_M, quad_segs=8).buffer(-MERGE_CLOSE_M, quad_segs=8)
    fill = closed.difference(um).intersection(bms.to_m(blocks_u).buffer(MERGE_NEAR_M))
    fill_deg = bms.to_deg(fill).difference(land)
    g = unary_union([u, fill_deg]).difference(land)
    # Holes that tur-med-schematic did not have (they are enclosed only because of the merge): the
    # parts of the Cyprus 12-nm territorial-sea cut-out that lie north of the 2011 line off the TRNC
    # coast. Waters off the TRNC coast are not "foreign" to a combined Türkiye + TRNC position, so
    # these are filled; holes that already exist in tur-med-schematic (Greek islands' TS) are kept.
    med_holes = unary_union([Polygon(r) for p in bms.parts(med_geom) for r in p.interiors])
    kept, filled = [], []
    for p in bms.parts(g):
        keep_rings = []
        for r in p.interiors:
            (keep_rings if med_holes.contains(Polygon(r).representative_point()) else filled).append(r)
        kept.append(Polygon(p.exterior, keep_rings))
    g = unary_union(kept).difference(land)
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
    report.append(f"Merged Türkiye+KKTC: {len(bms.parts(g))} parts, {holes} holes, {n} vertices, {geod_km2(g):,.0f} km² "
                  f"(tur-med-schematic {geod_km2(med_geom):,.0f} km² + blocks {geod_km2(blocks_u):,.0f} km², overlap "
                  f"{geod_km2(med_geom.intersection(blocks_u)):,.1f} km²); slivers filled {fill.area / 1e6:.1f} km²; "
                  f"overlap with NE 10m land {g.intersection(land).area:.1e} deg²")
    props = {
        "id": "tur-kktc-med-merged",
        "name_tr": "Doğu Akdeniz: Türkiye + KKTC birleşik deniz yetki alanı (şematik)",
        "name_en": "Eastern Mediterranean: combined Türkiye + TRNC maritime area (schematic)",
        "status": "schematic",
        "basis_tr": ("ŞEMATİK ALAN — Türkiye'nin ve KKTC'nin birlikte tutumunu tek bir dolgu olarak gösterir. İki bileşenin "
                     "birleşimidir: (1) `tur-med-schematic` (Türkiye'nin A/74/550 ve Türkiye–Libya Mutabakatı'na dayanan "
                     "şematik alanı; resmî koordinat değildir) ve (2) KKTC'nin TPAO'ya verdiği A–G deniz ruhsat sahaları "
                     f"(resmî koordinatlar: {GAZETTE_TR}, karar {DECISION}). KKTC'nin kendi ilan ettiği bir MEB veya kıta "
                     "sahanlığı dış sınırı yoktur; ruhsat sahaları KKTC'nin yetki iddiasını gösteren resmî alanlardır. "
                     "Türkiye ve KKTC'nin tutumuna göre Kıbrıs Türkleri adanın doğal kaynakları üzerinde eşit haklara "
                     "sahiptir. GKRY, Yunanistan ve Mısır bu tutuma itiraz etmektedir."),
        "basis_en": ("SCHEMATIC AREA — shows the combined Türkiye + TRNC position as a single fill. It is the union of (1) "
                     "`tur-med-schematic` (Türkiye's schematic area based on A/74/550 and the Türkiye–Libya MoU; not "
                     "official coordinates) and (2) the TRNC's offshore licence areas A–G granted to TPAO (official "
                     f"coordinates: {GAZETTE_EN}, decision {DECISION}). The TRNC has not declared an EEZ or continental-shelf "
                     "outer limit of its own; the licence areas are the official areas through which it asserts "
                     "jurisdiction. In Türkiye's and the TRNC's position, Turkish Cypriots have equal rights over the "
                     "island's natural resources. The Greek Cypriot Administration, Greece and Egypt contest this position."),
        "method_tr": ("İki bileşen birleştirildi (dissolve). Bileşenler arasındaki, 2 × "
                      f"{MERGE_CLOSE_M:g} m'den dar şeritler yalnızca ruhsat sahalarının {MERGE_NEAR_M / 1000:g} km "
                      "yakınında dolduruldu (morfolojik kapama): bunlar ED50 → WGS84 dönüşümü nedeniyle sahaların kuzey "
                      "kenarı ile sitedeki A/74/550 bölüm A çizgisi arasındaki ~100 m'lik fark ve B sahasının kuzey kenarının "
                      "A/74/550 5. noktasının altından geçen kirişidir. Birleşim sonucu kapanan ve `tur-med-schematic`'te "
                      "bulunmayan delikler (Karpaz açığında, 2011 hattının kuzeyinde kalan Kıbrıs 12 dm karasuları "
                      "kesiti) dolduruldu: Türkiye + KKTC birleşik tutumunda KKTC kıyısı açığındaki sular 'yabancı' "
                      "değildir. Yunan adalarının karasuları delikleri korundu. Ardından kara (Natural Earth 10m) "
                      "çıkarıldı; 1e-4° ızgara, dış halka saat yönünde."),
        "method_en": ("The two components are dissolved into one. Slivers narrower than 2 × "
                      f"{MERGE_CLOSE_M:g} m between them are filled only within {MERGE_NEAR_M / 1000:g} km of the licence "
                      "areas (morphological closing): they are the ~100 m offset between the blocks' northern edges "
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
        "components": ["tur-med-schematic"] + [f"kktc-licence-{b}" for b in BLOCKS],
        "sources": [bm.UNDOC + "A/74/550", bm.UNDOC + "A/74/757", RG_2011_161, RG_2011_198, RG_2023_219,
                    bm.MR_LICENCE, bm.NE_LAND],
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
        feats.append(merged_feature(shape(med["geometry"]), [shape(f["geometry"]) for f in feats], land, report))
    else:
        report.append("Merged Türkiye+KKTC: skipped (no tur-med-schematic feature)")
    return feats


def is_kktc(f) -> bool:
    p = f["properties"]
    return p.get("kind") == "kktc-licence" or p.get("id") == "tur-kktc-med-merged"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "gt-geo-cache")
    ap.add_argument("--out", type=Path, default=bm.OUT)
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
    print("\n".join(report))


if __name__ == "__main__":
    main()
