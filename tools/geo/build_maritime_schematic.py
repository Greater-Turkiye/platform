#!/usr/bin/env python3
"""Schematic Mavi Vatan areas (Aegean, Eastern Mediterranean) for maritime-tur.geojson.

These polygons are NOT official coordinates. Türkiye has published limit LINES for the
Eastern Mediterranean (A/74/550 sections A–C, the Türkiye–Libya MoU) and legal PRINCIPLES
for the Aegean; it has not published closed areas. The features built here are our own
geometric construction from that stated position and carry `status: "schematic"`.

Construction (all distances on a sphere, R = 6 371 008.8 m):
  * Distance fields. Coastlines (polygon boundaries of Natural Earth 10m admin-0
    countries + minor islands, public domain) are densified to <= ~200 m and put in a
    3-D k-d tree; every node of a 0.005° lon/lat grid gets its great-circle distance to
    each coast set. Iso-lines/areas are extracted with marching squares (contourpy,
    linear interpolation), i.e. a "raster distance transform" approach.
  * Aegean median: grid nodes closer to the Turkish MAINLAND (Anatolia + Eastern Thrace)
    than to the Greek MAINLAND (islands ignored on both sides) = Türkiye's side.
  * Greek islands' territorial sea: 6 nm from the island coast (normal baseline), cut
    back to the median line where it overlaps Türkiye's own waters (UNCLOS art. 15 logic).
    Syria: 12 nm, same median cut. Cyprus: Marine Regions "Cypriot 12 NM" (CC BY 4.0).
  * Eastern Mediterranean envelope: the notified lines, closed with the shortest straight
    connectors (MoU point A → Crete's 6-nm limit; MoU point B → A/74/550 B point A at 28°E;
    A/74/550 A point 23 → Türkiye–Syria land-border terminus).
  * Aegean/Mediterranean split: IHO S-23 limits as published by Marine Regions (CC BY 4.0).
  * Generalisation: the excluded set (land + foreign territorial seas) is grown by
    --gap metres and simplified with a smaller tolerance, so the simplified polygons stay
    off land/foreign territorial seas by construction; the notified lines stay exact.

Usage:
  python tools/geo/build_maritime_schematic.py [--cache DIR]   # rewrites the schematic
      features inside apps/web/assets/data/maritime-tur.geojson, keeps all other features
  (tools/geo/build_maritime.py calls build() as well, unless --no-schematic.)

Dependencies: shapely>=2.1, pyshp, numpy, scipy, contourpy (ships with matplotlib).
"""
from __future__ import annotations

import argparse
import io
import json
import math
import sys
import tempfile
import urllib.parse
import zipfile
from pathlib import Path

import contourpy
import numpy as np
import shapefile  # pyshp
import shapely
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import nearest_points, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_maritime as bm  # noqa: E402  (shared constants, coordinates and helpers)

# --------------------------------------------------------------------------------------
# Sources
# --------------------------------------------------------------------------------------
NE_COUNTRIES = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
NE_MINOR = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_minor_islands.zip"
MR_IHO = {  # Marine Regions IHO Sea Areas (IHO S-23, 1953), CC BY 4.0
    "aegean": 3315, "emed": 4280, "marmara": 3369}


def mr_iho_url(mrgid: int) -> str:
    return bm.WFS + "?" + urllib.parse.urlencode({
        "service": "WFS", "version": "1.0.0", "request": "GetFeature",
        "typeName": "MarineRegions:iho", "outputFormat": "application/json",
        "CQL_FILTER": f"mrgid={mrgid}"})


MR_GAZ = "https://www.marineregions.org/gazetteer.php?p=details&id="
TUR_ACT_1982 = bm.DOALOS_PDF + "TUR_1982_Act.pdf"
MFA_TS = "https://www.mfa.gov.tr/the-breadth-of-territorial-waters.en.mfa"
MFA_CS = "https://www.mfa.gov.tr/the-delimitation-of-the-aegean-continental-shelf.en.mfa"
MOU_PDF = bm.DOALOS_PDF + "TREATIES/Turkey_11122019_%28HC%29_MoU_Libya-Delimitation-areas-Mediterranean.pdf"

# --------------------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------------------
R_EARTH = 6371008.8
NM = 1852.0
TS_GREEK_ISLANDS = 6 * NM      # Türkiye's position; also the breadth both states apply in the Aegean
TS_SYRIA = 12 * NM
GRID_STEP = 0.005              # degrees (~450–555 m)
GRID = (22.0, 33.6, 30.4, 41.3)          # lon0, lat0, lon1, lat1 (Aegean + Dodecanese + Meis)
GRID_SYR = (35.2, 35.4, 36.4, 36.6)
DENSIFY = 0.002                # degrees between coast samples (~200 m)
FRAME = (18.0, 30.0, 40.0, 44.0)
CLOSE_LAT = 41.0               # the envelope's closing path runs along this parallel, over land
MEDIAN_SIMPLIFY_M = 150.0
MIN_PART_KM2 = 5.0             # drop isolated pockets smaller than this
VERTEX_BUDGET = 2000           # both schematic features together
GAP_STEPS = [(600, 450), (900, 700), (1200, 950), (1500, 1200), (2000, 1600), (2500, 2000)]

# Seed points used to pick land masses (lon, lat).
ANKARA, EDIRNE = (32.85, 39.93), (26.56, 41.68)
ATHENS, THESSALONIKI = (23.73, 37.98), (22.94, 40.64)
HERAKLION = (25.13, 35.34)
AEGEAN_SEED = (25.5, 38.5)

# LAEA (spherical, authalic ≈ mean radius) centred on the study area: metric work + areas.
LON0, LAT0 = math.radians(28.0), math.radians(37.5)


def to_m(geom):
    def f(xy):
        lam = np.radians(xy[:, 0]) - LON0
        phi = np.radians(xy[:, 1])
        k = np.sqrt(2.0 / (1 + math.sin(LAT0) * np.sin(phi) + math.cos(LAT0) * np.cos(phi) * np.cos(lam)))
        x = R_EARTH * k * np.cos(phi) * np.sin(lam)
        y = R_EARTH * k * (math.cos(LAT0) * np.sin(phi) - math.sin(LAT0) * np.cos(phi) * np.cos(lam))
        return np.column_stack([x, y])
    return shapely.transform(geom, f)


def to_deg(geom):
    def f(xy):
        x, y = xy[:, 0], xy[:, 1]
        rho = np.hypot(x, y)
        c = 2 * np.arcsin(np.clip(rho / (2 * R_EARTH), -1, 1))
        with np.errstate(invalid="ignore", divide="ignore"):
            phi = np.arcsin(np.cos(c) * math.sin(LAT0) + np.where(rho > 0, y * np.sin(c) * math.cos(LAT0) / rho, 0))
            lam = LON0 + np.arctan2(x * np.sin(c), rho * math.cos(LAT0) * np.cos(c) - y * math.sin(LAT0) * np.sin(c))
        return np.column_stack([np.degrees(lam), np.degrees(phi)])
    return shapely.transform(geom, f)


def km2(geom) -> float:
    return to_m(geom).area / 1e6


# --------------------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------------------
def read_zip_shp(raw: bytes, stem: str):
    z = zipfile.ZipFile(io.BytesIO(raw))
    return shapefile.Reader(shp=io.BytesIO(z.read(stem + ".shp")), shx=io.BytesIO(z.read(stem + ".shx")),
                            dbf=io.BytesIO(z.read(stem + ".dbf")))


def load_countries(cache: Path) -> dict[str, object]:
    r = read_zip_shp(bm.fetch(NE_COUNTRIES, cache, "ne_10m_admin_0_countries.zip"), "ne_10m_admin_0_countries")
    names = [f[0] for f in r.fields[1:]]
    frame = box(*FRAME)
    out = {}
    for s, rec in zip(r.shapes(), r.records()):
        b = s.bbox
        if b[0] > FRAME[2] or b[2] < FRAME[0] or b[1] > FRAME[3] or b[3] < FRAME[1]:
            continue
        a3 = dict(zip(names, rec))["ADM0_A3"]
        g = shape(s.__geo_interface__).buffer(0).intersection(frame)
        if not g.is_empty:
            out[a3] = g
    return out


def load_minor_islands(cache: Path) -> list:
    r = read_zip_shp(bm.fetch(NE_MINOR, cache, "ne_10m_minor_islands.zip"), "ne_10m_minor_islands")
    return [shape(s.__geo_interface__).buffer(0) for s in r.shapes()
            if FRAME[0] < s.bbox[0] < FRAME[2] and FRAME[1] < s.bbox[1] < FRAME[3]]


def load_iho(cache: Path) -> dict[str, object]:
    out = {}
    for k, mrgid in MR_IHO.items():
        fc = json.loads(bm.fetch(mr_iho_url(mrgid), cache, f"mr_iho_{mrgid}.json"))
        assert len(fc["features"]) == 1 and fc["features"][0]["properties"]["mrgid"] == mrgid
        out[k] = shape(fc["features"][0]["geometry"]).buffer(0)
    return out


def parts(g):
    return list(getattr(g, "geoms", [g]))


def pick(g, seeds):
    return unary_union([p for p in parts(g) if any(p.contains(Point(s)) for s in seeds)])


# --------------------------------------------------------------------------------------
# Distance fields on the sphere
# --------------------------------------------------------------------------------------
def xyz(lon, lat):
    lon, lat = np.radians(lon), np.radians(lat)
    return np.column_stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def coast_tree(geom, clip=(19.0, 31.0, 34.5, 43.5)):
    g = shapely.segmentize(geom.boundary.intersection(box(*clip)), DENSIFY)
    pts = shapely.get_coordinates(g)
    assert len(pts), "empty coast set"
    return cKDTree(xyz(pts[:, 0], pts[:, 1]))


def dist_field(tree, lon2d, lat2d):
    chord, _ = tree.query(xyz(lon2d.ravel(), lat2d.ravel()), workers=-1)
    return (2 * R_EARTH * np.arcsin(np.clip(chord / 2, 0, 1))).reshape(lon2d.shape)


def grid(bounds):
    lon = np.arange(bounds[0], bounds[2] + GRID_STEP / 2, GRID_STEP)
    lat = np.arange(bounds[1], bounds[3] + GRID_STEP / 2, GRID_STEP)
    return lon, lat, *np.meshgrid(lon, lat)


def region_le0(lon, lat, z):
    """Polygon(s) where z <= 0 (marching squares with linear interpolation)."""
    cg = contourpy.contour_generator(lon, lat, z, name="serial", fill_type=contourpy.FillType.OuterOffset)
    pts_list, offs_list = cg.filled(float(z.min()) - 1.0, 0.0)
    polys = []
    for pts, offs in zip(pts_list, offs_list):
        rings = [pts[offs[i]:offs[i + 1]] for i in range(len(offs) - 1)]
        polys.append(Polygon(rings[0], rings[1:]).buffer(0))
    return unary_union(polys)


# --------------------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------------------
def build(cache: Path, land, report: list[str]) -> list[dict]:
    C = load_countries(cache)
    minor = load_minor_islands(cache)
    iho = load_iho(cache)
    cyp_fc = json.loads(bm.fetch(bm.MR_12NM_CYP, cache, "mr_12nm_cyprus.json"))
    cyp_ts = shape(cyp_fc["features"][0]["geometry"]).buffer(0)

    tur, grc, syr = C["TUR"], C["GRC"], C["SYR"]
    tur_main = pick(tur, [ANKARA, EDIRNE])
    grc_main = pick(grc, [ATHENS, THESSALONIKI])
    assert len(parts(tur_main)) == 2 and len(parts(grc_main)) == 1, (len(parts(tur_main)), len(parts(grc_main)))
    grc_isl = [p for p in parts(grc) if not p.intersects(grc_main)]
    tur_isl = [p for p in parts(tur) if not p.intersects(tur_main)]

    # Minor islands (not in the admin-0 layer): attribute to the nearer of Greece / Türkiye.
    n_gr = n_tr = 0
    for m in minor:
        if m.distance(grc) < m.distance(tur):
            if m.distance(grc) < 0.3:
                grc_isl.append(m); n_gr += 1
        elif m.distance(tur) < 0.3:
            tur_isl.append(m); n_tr += 1
    grc_isl_u = unary_union(grc_isl)
    tur_all = unary_union([tur] + tur_isl)
    all_land = unary_union([land] + list(C.values()) + minor)
    report.append(f"Schematic: Greek islands {len(grc_isl)} polygons (incl. {n_gr} NE minor islands), "
                  f"Turkish islands {len(tur_isl)} (incl. {n_tr} minor)")

    # --- distance fields -------------------------------------------------------------
    lon, lat, LON, LAT = grid(GRID)
    t_tm, t_gm, t_ta, t_gi = (coast_tree(g) for g in (tur_main, grc_main, tur_all, grc_isl_u))
    d_tm, d_gm, d_ta, d_gi = (dist_field(t, LON, LAT) for t in (t_tm, t_gm, t_ta, t_gi))
    report.append(f"Schematic: grid {len(lon)}×{len(lat)} nodes at {GRID_STEP}°; coast samples "
                  f"TUR-main {t_tm.n}, GRC-main {t_gm.n}, TUR-all {t_ta.n}, GRC-islands {t_gi.n}")

    turk_side = region_le0(lon, lat, d_tm - d_gm)
    turk_side = unary_union([turk_side, box(GRID[2] - 0.1, 30.0, 40.0, 44.0)])
    turk_side = to_deg(to_m(turk_side).simplify(MEDIAN_SIMPLIFY_M))
    gr_ts = region_le0(lon, lat, np.maximum(d_gi - TS_GREEK_ISLANDS, d_gi - d_ta))

    lon_s, lat_s, LON_S, LAT_S = grid(GRID_SYR)
    d_sy = dist_field(coast_tree(syr, clip=(33.0, 33.0, 38.0, 38.0)), LON_S, LAT_S)
    d_ta_s = dist_field(coast_tree(tur_all, clip=(33.0, 33.0, 38.0, 38.0)), LON_S, LAT_S)
    sy_ts = region_le0(lon_s, lat_s, np.maximum(d_sy - TS_SYRIA, d_sy - d_ta_s))

    # --- Eastern Mediterranean envelope ---------------------------------------------
    sec_a = [bm.ll(la, lo) for la, lo in bm.A74550_A]
    sec_b = [bm.ll(la, lo) for _, la, lo in bm.A74550_B]
    mou = [bm.ll(la, lo) for _, la, lo in bm.MOU_LBY]
    # Türkiye–Syria land-border terminus: the border vertex nearest to the coastline.
    border = tur.boundary.intersection(syr.boundary)
    coast_only = all_land.boundary.difference(border.buffer(1e-4))
    s_term = min((Point(c) for c in shapely.get_coordinates(border)), key=lambda p: p.distance(coast_only))
    crete = pick(grc, [HERAKLION])
    crete_ts = next(p for p in parts(gr_ts) if p.intersects(crete))
    j2 = nearest_points(crete_ts.exterior, Point(mou[0]))[0]
    # Envelope west of point A runs along the southern arc of Crete's 6-nm limit (from its
    # western end to J2) — the TS itself is excluded anyway, so this adds no area.
    ext = np.asarray(crete_ts.exterior.coords)[:-1]
    iw, ij = int(np.argmin(ext[:, 0])), int(np.argmin(np.hypot(*(ext - [j2.x, j2.y]).T)))
    arc1 = ext[np.arange(iw, iw + ((ij - iw) % len(ext)) + 1) % len(ext)]
    arc2 = ext[np.arange(iw, iw - ((iw - ij) % len(ext)) - 1, -1) % len(ext)]
    arc = min(arc1, arc2, key=lambda a: a[:, 1].mean())            # the southern one
    c0 = Point(arc[0])
    crete_arc = [tuple(c) for c in arc[:-1]] + [(j2.x, j2.y)]
    # Closing path over land and the Greek side. Note: the metric steps below (to_m/to_deg, LAEA)
    # treat the 15°-long (37,41)–(22,41) edge as a straight chord, which bulges to 41.23°N at 31°E
    # and reaches the Black Sea coast off Sakarya (41.09–41.12°N). The resulting Black Sea piece is
    # removed where parts are selected (outside the IHO Aegean/Eastern Mediterranean basins).
    # Densifying this edge would also avoid it; the Aegean geometry stays the same, but its ring is
    # re-ordered, which breaks byte-stability of tur-aegean-schematic, so the selection rule is used.
    closure = [(s_term.x + 0.9, s_term.y + 0.1), (37.0, CLOSE_LAT), (22.0, CLOSE_LAT), (22.0, 35.6)]
    ring = crete_arc + mou + sec_b + sec_a + [(s_term.x, s_term.y)] + closure
    envelope = Polygon(ring)
    assert envelope.is_valid, shapely.is_valid_reason(envelope)

    report.append(f"Schematic: Türkiye–Syria land-border terminus (NE 10m) {s_term.y:.4f}N {s_term.x:.4f}E; "
                  f"connector A/74/550 A23→terminus {bm.metres(Point(sec_a[-1]), Point(s_term)) / 1000:.1f} km")
    report.append(f"Schematic: MoU A→Crete 6-nm limit connector {bm.metres(Point(mou[0]), j2) / 1000:.1f} km, "
                  f"ends {j2.y:.4f}N {j2.x:.4f}E; MoU B→A/74/550 B pt A connector "
                  f"{bm.metres(Point(mou[1]), Point(sec_b[0])) / 1000:.1f} km")

    # The closing path over land / non-Turkish side must add no sea area of its own.
    mask_ok = unary_union([all_land, gr_ts.buffer(1e-6), iho["marmara"].buffer(0.05)])
    for a, b in zip([ring[-1], (s_term.x, s_term.y)] + closure[:-1], [(c0.x, c0.y), closure[0]] + closure[1:]):
        seg = LineString([a, b])
        stray = seg.intersection(turk_side).difference(mask_ok)
        assert stray.length < 1e-6, f"closing segment {a}->{b} crosses Turkish-side sea ({stray.length:.4f}°)"
    # Median checks: where it meets Crete, that it starts at the Evros/Meriç land-border terminus,
    # and an independent spot check of equidistance (planar LAEA distances to the NE polygons).
    med = to_deg(to_m(turk_side).boundary).intersection(box(22.1, 33.7, 30.2, 41.2))
    med_crete = med.intersection(crete.buffer(0.001))
    report.append(f"Schematic: Aegean median line crosses Crete near lon {med_crete.centroid.x:.2f}E")
    tg_border = tur.boundary.intersection(grc.boundary)
    evros = min((Point(c) for c in shapely.get_coordinates(tg_border)),
                key=lambda p: p.distance(all_land.boundary.difference(tg_border.buffer(1e-4))))
    report.append(f"Schematic: Türkiye–Greece land-border terminus (Evros/Meriç mouth, NE 10m) {evros.y:.4f}N "
                  f"{evros.x:.4f}E; distance to median line {bm.metres(evros, med):.0f} m")
    tm_m, gm_m = to_m(tur_main), to_m(grc_main)
    sea_med = med.difference(unary_union([all_land, gr_ts]).buffer(0.01))
    for lat_q in (40.3, 39.5, 38.5, 37.5, 36.5, 35.8):
        seg = sea_med.intersection(box(22, lat_q - 0.02, 30, lat_q + 0.02))
        if seg.is_empty:
            continue
        q = to_m(seg.representative_point())
        a, b = q.distance(tm_m), q.distance(gm_m)
        report.append(f"  median check ~{lat_q}N {to_deg(q).x:.3f}E: to TUR mainland {a / 1000:.2f} km, "
                      f"to GRC mainland {b / 1000:.2f} km (LAEA planar, Δ {abs(a - b) / 1000:.2f} km)")

    # --- exclusion set, subtraction, generalisation ---------------------------------
    work = envelope.intersection(turk_side)
    excl = unary_union([all_land, gr_ts, cyp_ts, sy_ts]).intersection(box(*work.buffer(0.3).bounds))
    excl_m, work_m = to_m(excl), to_m(work)
    # Dardanelles closing line = the edge shared by the IHO Aegean and Sea of Marmara polygons
    # (IHO S-23: Kumkale – Cape Helles), extended ~3 km into land at both ends.
    shared = shapely.get_coordinates(iho["aegean"].boundary.intersection(iho["marmara"].boundary.buffer(1e-4)))
    p0, p1 = max(((a, b) for a in shared for b in shared), key=lambda ab: np.hypot(*(ab[0] - ab[1])))
    v = (p1 - p0) / np.hypot(*(p1 - p0))
    dard_cut = LineString([p0 - 0.03 * v, p1 + 0.03 * v])
    report.append(f"Schematic: Dardanelles closing line (IHO S-23 via Marine Regions) "
                  f"{p0[1]:.4f}N {p0[0]:.4f}E – {p1[1]:.4f}N {p1[0]:.4f}E")
    mar_zone = iho["marmara"].buffer(0.05)

    for gap, tol in GAP_STEPS:
        xs = excl_m.buffer(gap, quad_segs=4).simplify(tol)
        t = to_deg(work_m.difference(xs))
        # cut off the Dardanelles / Sea of Marmara and drop whatever lies beyond the closing line
        t = t.difference(unary_union([iho["marmara"], dard_cut.buffer(1e-5)]))
        t = unary_union([p for p in parts(t) if p.intersection(mar_zone).area < 0.5 * p.area])
        aeg_mask = iho["aegean"].buffer(0.05).difference(iho["emed"])
        # Only parts in the IHO Aegean Sea or Eastern Mediterranean basin are kept: this drops
        # anything the envelope picks up in the Black Sea (see the closure note) or the Marmara.
        basins = unary_union([iho["aegean"], iho["emed"]])
        out = {}
        for key, g in (("aegean", t.intersection(aeg_mask)), ("med", t.difference(aeg_mask))):
            stray = [p for p in parts(g) if p.geom_type == "Polygon" and not p.intersects(basins)]
            keep = [p for p in parts(g) if p.geom_type == "Polygon" and km2(p) >= MIN_PART_KM2 and p.intersects(basins)]
            dropped = [p for p in parts(g) if p.geom_type == "Polygon" and km2(p) < MIN_PART_KM2 and p.intersects(basins)]
            if stray and gap == GAP_STEPS[0][0]:
                report.append(f"Schematic {key}: dropped {len(stray)} part(s) outside the IHO Aegean/Eastern Mediterranean "
                              f"basins, {sum(km2(p) for p in stray):.1f} km² at "
                              + ", ".join(f"{p.bounds[1]:.2f}–{p.bounds[3]:.2f}N {p.bounds[0]:.2f}–{p.bounds[2]:.2f}E" for p in stray))
            g = shapely.set_precision(MultiPolygon(keep), 1e-4)
            g = unary_union([p for p in parts(g) if p.geom_type == "Polygon"])
            g = shapely.orient_polygons(g, exterior_cw=True)
            if g.geom_type == "Polygon":
                g = MultiPolygon([g])      # keep the feature type stable (MultiPolygon) when one part remains
            out[key] = (g, len(dropped), sum(km2(p) for p in dropped))
        total = sum(bm.nverts(g) for g, _, _ in out.values())
        report.append(f"Schematic: gap {gap} m / simplify {tol} m -> {total} vertices")
        if total <= VERTEX_BUDGET:
            break

    for key, (g, nd, ad) in out.items():
        assert g.is_valid, key
        # Both areas lie south of the closing parallel (no Black Sea), and the Aegean area touches the
        # Sea of Marmara at most along the Dardanelles closing line (edge contact, < 0.1 km²).
        assert g.bounds[3] < CLOSE_LAT, (key, g.bounds)
        mar = g.intersection(iho["marmara"]).area
        assert mar < 1e-5, (key, mar)
        report.append(f"Schematic {key}: northernmost point {g.bounds[3]:.4f}N (< {CLOSE_LAT}N); "
                      f"overlap with IHO Sea of Marmara {km2(g.intersection(iho['marmara'])):.3f} km²")
        bad = g.intersection(all_land).area + g.intersection(gr_ts).area + g.intersection(cyp_ts).area \
            + g.intersection(sy_ts).area
        assert bad < 1e-9, (key, bad)
        for p in parts(g):
            assert not p.exterior.is_ccw and all(r.is_ccw for r in p.interiors)
        report.append(f"Schematic {key}: {len(parts(g))} parts, {sum(len(p.interiors) for p in parts(g))} holes, "
                      f"{bm.nverts(g)} vertices, {km2(g):,.0f} km²; dropped {nd} pockets < {MIN_PART_KM2} km² "
                      f"({ad:.1f} km²); overlap land/foreign TS = {bad:.1e} deg²")
    # clearances
    for key, (g, _, _) in out.items():
        gm = to_m(g)
        report.append(f"Schematic {key}: min clearance to NE land {gm.distance(to_m(all_land.intersection(box(*g.buffer(0.1).bounds)))):.0f} m, "
                      f"to Greek islands' 6-nm TS {gm.distance(to_m(gr_ts)):.0f} m")

    gap_used, tol_used = gap, tol
    return features(out, gap_used, tol_used, s_term, j2)


def geojson_geom(g) -> dict:
    def r(c):
        return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    m = shapely.geometry.mapping(g)
    return {"type": m["type"], "coordinates": r(json.loads(json.dumps(m["coordinates"])))}


def features(out, gap, tol, s_term, j2) -> list[dict]:
    common_tr = ("ŞEMATİK ALAN — resmî koordinat değildir. Türkiye bu alanın sınır koordinatlarını "
                 "yayımlamamıştır; poligon, Türkiye'nin açıkladığı hukuki tutumdan bu proje tarafından "
                 "geometrik olarak türetilmiştir. Kıyıya ve yabancı karasularına bakan kenarlar "
                 f"genelleştirilmiştir (karadan ve yabancı karasularından {gap} m geri çekilmiş, {tol} m "
                 "toleransla sadeleştirilmiş); bu nedenle kıyıyla alan arasında birkaç yüz metreden birkaç "
                 "kilometreye kadar boşluk görünebilir.")
    common_en = ("SCHEMATIC AREA — not official coordinates. Türkiye has not published boundary coordinates "
                 "for this area; the polygon is this project's geometric construction from Türkiye's stated "
                 "legal position. Edges facing coasts and foreign territorial seas are generalised (set back "
                 f"{gap} m from land and foreign territorial seas, simplified with a {tol} m tolerance), so a "
                 "gap of a few hundred metres to a few kilometres may show along the coast.")
    ne_src = [bm.NE_LAND, NE_COUNTRIES, NE_MINOR]
    attrib = ("Marine Regions (VLIZ) — Cypriot 12 NM, IHO Sea Areas — © Flanders Marine Institute, "
              "CC BY 4.0; coastlines: Natural Earth (public domain)")
    s_txt = f"{s_term.y:.4f}K {s_term.x:.4f}D"
    s_txt_en = f"{s_term.y:.4f}N {s_term.x:.4f}E"
    j2_tr, j2_en = f"{j2.y:.4f}K {j2.x:.4f}D", f"{j2.y:.4f}N {j2.x:.4f}E"

    med = {
        "id": "tur-med-schematic",
        "name_tr": "Doğu Akdeniz: Türkiye'nin tutumuna göre deniz yetki alanı (şematik)",
        "name_en": "Eastern Mediterranean: maritime jurisdiction area per Türkiye's position (schematic)",
        "status": "schematic",
        "basis_tr": (common_tr + " Dayanak: Türkiye'nin BM'ye bildirdiği kıta sahanlığı dış sınırları "
                     "(A/74/550, ek, bölüm A–C: 2011 Türkiye–KKTC hattı, Türkiye–Mısır kıyıları arası orta hat, "
                     "32°16'18\"D boylamı 'yabancı karasuları hariç'), bölüm D'deki 'adalar Türkiye'nin kıyı "
                     "izdüşümünü kesemez; 28°D batısında Türkiye kıta sahanlığı adaların karasularının dış "
                     "sınırına uzanır' ifadesi ve Türkiye–Libya Mutabakat Muhtırası (27 Kasım 2019; A/74/757). "
                     "KKTC'nin kendi deniz yetki alanı 2011 hattının güneyinde (KKTC tarafında) kalır; bu "
                     "alana dahil edilmemiştir. Yunanistan, GKRY, Mısır ve diğer kıyıdaş devletler bu tutuma "
                     "itiraz etmektedir."),
        "basis_en": (common_en + " Basis: the outer limits of Türkiye's continental shelf notified to the UN "
                     "(A/74/550, annex, sections A–C: the 2011 Türkiye–TRNC line, the median line between the "
                     "Turkish and Egyptian coasts, and meridian 32°16'18\"E 'except foreign territorial waters'), "
                     "section D's statement that west of 28°E Türkiye's shelf extends to the outer limits of the "
                     "islands' territorial waters because insular features cannot cut off Türkiye's coastal "
                     "projection, and the Türkiye–Libya MoU (27 Nov 2019; A/74/757). The TRNC's own maritime "
                     "area lies south of the 2011 line (on the TRNC side) and is not included. Greece, the Greek "
                     "Cypriot Administration, Egypt and other coastal states contest this position."),
        "method_tr": ("Alan: Türkiye'nin güney kıyısı (İskenderun Körfezi dahil) ile bildirilen hatlar arası deniz. "
                      "Boşluklar en kısa düz bağlantılarla kapatıldı: (1) Libya Mutabakatı A noktası → Girit ve "
                      f"çevresindeki adacıkların 6 dm karasuları dış sınırındaki en yakın nokta ({j2_tr}); "
                      "(2) Mutabakat B noktası → A/74/550 bölüm B'nin 28°D'deki batı ucu (A noktası); "
                      "(3) A/74/550 bölüm A'nın doğu ucu (23. nokta) → Türkiye–Suriye kara sınırının kıyıdaki "
                      f"ucu ({s_txt}, Natural Earth 10m). Çıkarılanlar: kara (Natural Earth 10m), Kıbrıs adası "
                      "ve 12 dm karasuları (Marine Regions 'Cypriot 12 NM'), Yunan adalarının (Rodos, Meis, "
                      "Kerpe, Kaşot, Girit vd.) kıyıdan ölçülen 6 dm karasuları — Türkiye kıyısına bindiği yerde "
                      "iki kıyı arası orta hatla sınırlandırılmış — ve Suriye'nin 12 dm karasuları (Türkiye ile "
                      "orta hatla sınırlandırılmış). Mesafeler küre üzerinde, 0,005° ızgarada mesafe "
                      "dönüşümüyle hesaplandı. Ege ile ayrım IHO S-23 (Marine Regions) sınırına göredir. "
                      f"{MIN_PART_KM2:g} km²'den küçük kopuk cepler atıldı."),
        "method_en": ("Area: the sea between Türkiye's southern coast (incl. the Gulf of İskenderun) and the "
                      "notified lines. Gaps closed with the shortest straight connectors: (1) Libya MoU point A → "
                      "nearest point on the 6-nm territorial-sea limit of Crete and its offshore islets "
                      f"({j2_en}); (2) MoU point B → the western end of A/74/550 section B at 28°E (point A); "
                      "(3) eastern end of A/74/550 section A (point 23) → the Türkiye–Syria land-border terminus "
                      f"on the coast ({s_txt_en}, Natural Earth 10m). Removed: land (Natural Earth 10m), the "
                      "island of Cyprus and its 12-nm territorial sea (Marine Regions 'Cypriot 12 NM'), the 6-nm "
                      "territorial sea of Greek islands (Rhodes, Kastellorizo/Meis, Karpathos, Kasos, Crete, etc.) "
                      "measured from the coast and cut back to the median line where it overlaps Türkiye's own "
                      "waters, and Syria's 12-nm territorial sea (median-line cut against Türkiye). Distances "
                      "computed on the sphere with a distance transform on a 0.005° grid. The split from the "
                      "Aegean follows the IHO S-23 limit (Marine Regions). Detached pockets smaller than "
                      f"{MIN_PART_KM2:g} km² are dropped."),
        "position_tr": bm.POS_TR, "position_en": bm.POS_EN, "contested": True,
        "contested_by": ["Greece", "GKRY / Republic of Cyprus", "Egypt"],
        "attribution": attrib,
        "sources": [bm.DOALOS_TUR, bm.UNDOC + "A/74/550", bm.UNDOC + "A/74/757", MOU_PDF,
                    MR_GAZ + str(MR_IHO["emed"]), bm.MR_LICENCE] + ne_src,
    }

    aeg = {
        "id": "tur-aegean-schematic",
        "name_tr": "Ege Denizi: Türkiye'nin tutumuna göre deniz yetki alanı (şematik)",
        "name_en": "Aegean Sea: maritime jurisdiction area per Türkiye's position (schematic)",
        "status": "schematic",
        "basis_tr": (common_tr + " Dayanak: Türkiye'nin tutumuna göre Ege kıta sahanlığı hakkaniyet ilkelerine "
                     "göre ve ilgili tüm özel koşullar dikkate alınarak anlaşmayla sınırlandırılmalıdır "
                     "(A/74/550; 1976 Bern Anlaşması); Türkiye kıyısına yakın Yunan adaları karasularının "
                     "ötesinde kıta sahanlığı/MEB yaratmamalı, adalar Türkiye'nin kıyı izdüşümünü "
                     "kesmemelidir (A/74/550, bölüm D); Ege'de karasuları genişliği 6 deniz milidir (2674 "
                     "sayılı Kanun; Dışişleri Bakanlığı). Sınırlandırma anlaşması yoktur; Yunanistan bu "
                     "tutuma itiraz etmekte ve adaların tam etki doğurduğunu savunmaktadır."),
        "basis_en": (common_en + " Basis: Türkiye's position that the Aegean continental shelf must be delimited by "
                     "agreement on equitable principles, taking all special and relevant circumstances into "
                     "account (A/74/550; 1976 Bern Agreement); that Greek islands close to the Turkish coast "
                     "should not generate continental shelf/EEZ beyond their territorial sea and cannot cut off "
                     "Türkiye's coastal projection (A/74/550, section D); and that the territorial sea in the "
                     "Aegean is 6 nautical miles (Act No. 2674; Ministry of Foreign Affairs). No delimitation "
                     "agreement exists; Greece contests this position and holds that islands have full effect."),
        "method_tr": ("Türkiye ana karası (Anadolu + Doğu Trakya) ile Yunanistan ana karası (Mora, Atika, Teselya, "
                      "Makedonya, Trakya) kıyıları arasındaki orta (eşit uzaklık) hattı, iki taraftaki tüm adalar "
                      "yok sayılarak hesaplandı: Natural Earth 10m kıyıları ~200 m aralıkla örneklendi, 0,005° "
                      "ızgaranın her düğümüne küre üzerindeki en kısa uzaklık k-d ağacıyla bulundu ve eşit "
                      "uzaklık eğrisi doğrusal ara değerlemeyle çıkarıldı (raster mesafe dönüşümü). Hat, "
                      "Meriç ağzından (kara sınırının kıyı ucu) güneye, Girit'in karasularına kadar izlenir; "
                      "Türkiye tarafı alındı. Her Yunan adası ve adacığının (Natural Earth 10m ülkeler + küçük "
                      "adalar) kıyıdan ölçülen 6 dm karasuları çıkarıldı; Türkiye kıyısına 12 dm'den yakın "
                      "olduğu yerde karasuları iki kıyı arası orta hatta kesildi. Türk adaları (Gökçeada, "
                      "Bozcaada vb.) alan içinde bırakıldı (yalnızca karaları çıkarıldı). Kuzeyde Çanakkale "
                      "Boğazı IHO S-23 Kumkale–Seddülbahir hattında kesildi; Akdeniz ile ayrım IHO S-23 "
                      "(Marine Regions 'Aegean Sea') sınırına göredir. EGAYDAAK kapsamındaki adacıklar ayrıca "
                      "işlenmedi: Natural Earth'ün egemenlik ataması kullanıldı; küçük adalar en yakın ülkeye "
                      f"atandı. {MIN_PART_KM2:g} km²'den küçük kopuk cepler atıldı."),
        "method_en": ("Median (equidistance) line between the Turkish MAINLAND coast (Anatolia + Eastern Thrace) and "
                      "the Greek MAINLAND coast (Peloponnese, Attica, Thessaly, Macedonia, Thrace), ignoring all "
                      "islands on both sides: Natural Earth 10m coastlines sampled every ~200 m, great-circle "
                      "distance to the nearest sample found for every node of a 0.005° grid with a k-d tree, and "
                      "the equidistance curve extracted with linear interpolation (raster distance transform). "
                      "The line is followed from the Evros/Meriç mouth (coastal end of the land border) south to "
                      "Crete's territorial sea; Türkiye's side is kept. The 6-nm territorial sea of every Greek "
                      "island and islet (Natural Earth 10m admin-0 + minor islands), measured from its coast, is "
                      "removed; where it comes within 12 nm of the Turkish coast it is cut at the median line "
                      "between the two coasts. Turkish islands (Gökçeada, Bozcaada, etc.) stay inside the area "
                      "(only their land is removed). In the north the Dardanelles are cut at the IHO S-23 "
                      "Kumkale–Cape Helles line; the split from the Mediterranean follows the IHO S-23 limit "
                      "(Marine Regions 'Aegean Sea'). Islets covered by Türkiye's EGAYDAAK position are not "
                      "treated separately: Natural Earth's sovereignty attribution is used and minor islands are "
                      f"assigned to the nearer country. Detached pockets smaller than {MIN_PART_KM2:g} km² are dropped."),
        "position_tr": bm.POS_TR, "position_en": bm.POS_EN, "contested": True,
        "contested_by": ["Greece"],
        "attribution": attrib,
        "sources": [bm.UNDOC + "A/74/550", MFA_CS, MFA_TS, TUR_ACT_1982, bm.MFA_EGAYDAAK,
                    MR_GAZ + str(MR_IHO["aegean"]), bm.MR_LICENCE] + ne_src,
    }
    return [{"type": "Feature", "properties": aeg, "geometry": geojson_geom(out["aegean"][0])},
            {"type": "Feature", "properties": med, "geometry": geojson_geom(out["med"][0])}]


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
    import build_kktc_licences as bk  # keeps the TRNC licence areas and rebuilds the merged area on top
    base = [f for f in fc["features"] if f["properties"].get("status") != "schematic" and not bk.is_kktc(f)]
    lic = [f for f in fc["features"] if f["properties"].get("kind") == "kktc-licence"]
    new = build(args.cache, land, report)
    feats = base + new + lic
    if lic:
        med = next(f for f in new if f["properties"]["id"] == "tur-med-schematic")
        feats.append(bk.merged_feature(shape(med["geometry"]), [shape(f["geometry"]) for f in lic], land, report, args.cache))
    meta = {k: v for k, v in fc.items() if k not in ("type", "features")}
    meta["description"] = bm.META_DESCRIPTION
    bm.write_fc(path, feats, meta)
    print("\n".join(report))


if __name__ == "__main__":
    main()
