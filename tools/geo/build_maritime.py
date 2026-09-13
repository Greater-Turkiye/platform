#!/usr/bin/env python3
"""Build the maritime-jurisdiction and islands layers for apps/web.

Outputs (plain RFC 7946 GeoJSON, WGS84 [lon, lat], 4 decimals):
  apps/web/assets/data/maritime-tur.geojson
  apps/web/assets/data/islands-tur.geojson

Every coordinate comes from a fetched, citable source. Nothing here is hand-drawn:
  * Black Sea: the Marine Regions (VLIZ) "Turkish Exclusive Economic Zone" polygon
    (CC BY 4.0), whose boundaries follow the 1973/1978/1986-87/1997 agreements. It is
    clipped to the Black Sea and cross-checked against the treaty coordinates below.
  * Eastern Mediterranean: the coordinate lists Türkiye notified to the UN in
    A/74/550 (13 Nov 2019) and A/74/757 (18 Mar 2020), plus the Türkiye–Libya MoU
    (27 Nov 2019, UNTS reg. 56119). These are published as LINES (limit lines),
    not polygons: Türkiye has not published closing coordinates (east of point A23,
    or west of 28°E) and inventing them is out of scope.
  * Islands: Wikidata P625 coordinates (CC0), one QID per island.
  * TRNC licence areas A–G (TRNC Official Gazette No. 161, 22 Sep 2011) and the merged
    Türkiye + TRNC area: tools/geo/build_kktc_licences.py (corner tables in kktc_licences.csv).
See apps/web/assets/data/MARITIME-SOURCES.md for provenance and caveats.

Usage:
  python tools/geo/build_maritime.py [--cache DIR] [--preview out.png] [--no-schematic] [--no-kktc]

Dependencies: shapely>=2, pyshp (shapefile), pyproj (TRNC licence areas), matplotlib (only for --preview).
"""
from __future__ import annotations

import argparse
import io
import json
import math
import re
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

import shapefile  # pyshp
import shapely
from shapely.geometry import (LineString, MultiLineString, MultiPolygon, Point,
                              Polygon, box, mapping, shape)
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "assets" / "data"
UA = "GreaterTurkiye-geodata/0.1 (+https://github.com/Greater-Turkiye/platform)"

# --------------------------------------------------------------------------------------
# Source URLs
# --------------------------------------------------------------------------------------
WFS = "https://geo.vliz.be/geoserver/MarineRegions/wfs"
MR_EEZ_TUR = WFS + "?" + urllib.parse.urlencode({
    "service": "WFS", "version": "1.0.0", "request": "GetFeature",
    "typeName": "MarineRegions:eez", "outputFormat": "application/json",
    "CQL_FILTER": "mrgid=5697"})
MR_12NM_CYP = WFS + "?" + urllib.parse.urlencode({
    "service": "WFS", "version": "1.0.0", "request": "GetFeature",
    "typeName": "MarineRegions:eez_12nm", "outputFormat": "application/json",
    "CQL_FILTER": "sovereign1='Cyprus'"})
NE_LAND = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip"

DOALOS_TUR = "https://www.un.org/depts/los/LEGISLATIONANDTREATIES/STATEFILES/TUR.htm"
DOALOS_PDF = "https://www.un.org/depts/los/LEGISLATIONANDTREATIES/PDFFILES/"
UNDOC = "https://documents.un.org/api/symbol/access?l=en&t=pdf&s="
MR_EEZ_PAGE = "https://www.marineregions.org/gazetteer.php?p=details&id=5697"
MR_LICENCE = "https://www.marineregions.org/disclaimer.php"
MFA_KARDAK = "https://www.mfa.gov.tr/the-kardak-dispute.en.mfa"
MFA_EGAYDAAK = ("https://www.mfa.gov.tr/islands_-islets-and-rocks-in-the-aegean-which-were-"
                "not-ceded-to-greece-by-international-treaties.en.mfa")

# --------------------------------------------------------------------------------------
# Official coordinates, transcribed verbatim (DMS) from the cited documents
# --------------------------------------------------------------------------------------
# A/74/550, annex, section A: Türkiye–TRNC Continental Shelf Delimitation Agreement
# (21 Sep 2011), between 32°16'18"E and 34°48'51.634"E.
A74550_A = [
    ("35-33-09.584", "32-16-18.000"), ("35-33-41.913", "32-21-12.349"),
    ("35-33-47.278", "32-31-50.801"), ("35-35-38.364", "32-37-51.980"),
    ("35-37-58.043", "32-46-34.195"), ("35-39-53.677", "32-56-36.616"),
    ("35-40-59.868", "33-02-50.096"), ("35-40-55.189", "33-10-19.709"),
    ("35-41-19.465", "33-19-40.157"), ("35-40-58.546", "33-23-18.544"),
    ("35-41-14.617", "33-32-33.838"), ("35-41-45.874", "33-38-16.025"),
    ("35-42-04.417", "33-45-08.528"), ("35-42-29.670", "33-53-00.873"),
    ("35-43-50.531", "34-02-48.043"), ("35-45-06.627", "34-06-06.897"),
    ("35-45-44.498", "34-10-13.085"), ("35-48-11.903", "34-14-21.393"),
    ("35-49-46.780", "34-18-51.643"), ("35-51-41.517", "34-24-51.492"),
    ("35-52-57.081", "34-28-43.550"), ("35-54-25.608", "34-33-30.506"),
    ("35-54-42.208", "34-36-28.498"),
]
# A/74/550, annex, section B: median line between the Turkish and Egyptian coasts,
# 28°00'00"E to 32°16'18"E (points A–N). "Subject to a bilateral agreement to be
# reached between Turkey and Egypt."
A74550_B = [
    ("A", "33-53-03.700", "28-00-00.000"), ("B", "33-46-37.982", "28-22-32.752"),
    ("C", "33-42-10.738", "28-41-14.431"), ("D", "33-40-51.422", "28-46-24.339"),
    ("E", "33-44-42.734", "29-20-18.089"), ("F", "33-49-51.799", "30-14-28.443"),
    ("G", "33-50-40.770", "30-18-34.016"), ("H", "33-54-00.509", "30-53-29.646"),
    ("I", "33-54-58.407", "31-04-19.857"), ("J", "33-56-42.089", "31-21-27.702"),
    ("K", "33-51-54.050", "31-43-52.936"), ("L", "33-51-18.290", "31-46-24.013"),
    ("M", "33-50-21.651", "31-53-04.910"), ("N", "33-47-04.112", "32-16-18.000"),
]
# A/74/550, annex, section C: straight line 35-33-09.584N/32-16-18E to
# 33-47-04.112N/32-16-18E "except foreign territorial waters".
A74550_C = [("33-47-04.112", "32-16-18.000"), ("35-33-09.584", "32-16-18.000")]
# Türkiye–Libya MoU, Art. I(1) (WGS84): Point A and Point B.
# A/74/757 annex calls the same points F and E.
MOU_LBY = [("A", "34-16-13.720", "26-19-11.640"), ("B", "34-09-07.900", "26-39-06.300")]

# Black Sea treaty turning points, used only to CROSS-CHECK the Marine Regions polygon.
# 1978 Turkey–USSR continental shelf agreement, Art. 1 (EEZ since 1986/87 notes).
TUR_USSR_1978 = [
    ("41-35-41", "41-16-33"), ("41-57-00", "40-41-33"), ("42-01-52", "40-26-00"),
    ("42-08-21", "39-49-37"), ("42-20-15", "39-00-13"), ("42-25-28", "38-32-10"),
    ("43-10-55", "36-50-42"), ("43-26-04", "36-10-57"), ("43-26-08", "35-30-25"),
    ("43-11-17", "34-13-10"), ("43-11-50", "33-36-56"), ("43-20-43", "32-00-00"),
]
# 1997 Turkey–Bulgaria agreement, Art. 4 (continental shelf/EEZ turning points 1–10).
TUR_BGR_1997 = [
    ("41-59-52", "28-19-26"), ("42-14-28", "29-20-45"), ("42-26-24", "29-34-20"),
    ("42-29-24", "29-49-36"), ("42-33-27", "29-58-30"), ("42-48-03", "30-34-10"),
    ("42-49-31", "30-36-18"), ("42-56-43", "30-45-06"), ("43-19-54", "31-06-33"),
    ("43-26-49", "31-20-43"),
]

# IHO S-23 (1953) limit between the Black Sea and the Bosphorus: the line joining
# Rumeli Feneri and Anadolu Feneri, 41°13'N. Everything south of it in the Bosphorus /
# Marmara corner is excluded from the Black Sea component.
BOSPHORUS_LIMIT_LAT = 41 + 13 / 60

# Islands: Wikidata items (P625 read at build time is recorded below for offline builds).
ISLANDS = [
    # qid, name_tr, name_en, lat, lon (Wikidata P625, first statement)
    ("Q658437", "Gökçeada", "Gökçeada (Imbros)", 40.1626, 25.8289),
    ("Q211817", "Bozcaada", "Bozcaada (Tenedos)", 39.816666666667, 26.05),
    ("Q6977903", "Tavşan Adaları", "Rabbit Islands (Tavşan Adaları)", 39.934722222222, 26.066666666667),
    ("Q950908", "Marmara Adası", "Marmara Island", 40.6225, 27.63),
    ("Q791572", "Avşa", "Avşa Island", 40.506666666667, 27.511388888889),
    ("Q989883", "Büyükada", "Büyükada", 40.857777777778, 29.12),
    ("Q2740733", "Cunda (Alibey) Adası", "Cunda (Alibey) Island", 39.360555555556, 26.642777777778),
    ("Q3084314", "Uzunada", "Uzunada", 38.501666666667, 26.713888888889),
    ("Q2254939", "Karaada (Bodrum)", "Karaada (Bodrum)", 36.973888888889, 27.4625),
    ("Q2666727", "Kekova Adası", "Kekova Island", 36.183333333333, 29.883333333333),
]
KARDAK = ("Q2119012", "Kardak Kayalıkları", "Kardak Rocks (Imia)", 37.050833333333, 27.151111111111)
ISLAND_WIKI = {  # page the coordinate was cross-checked against
    "Q658437": "https://en.wikipedia.org/wiki/Imbros",
    "Q211817": "https://en.wikipedia.org/wiki/Tenedos",
    "Q6977903": "https://tr.wikipedia.org/wiki/Karayer_Adaları",
    "Q950908": "https://en.wikipedia.org/wiki/Marmara_Island",
    "Q791572": "https://en.wikipedia.org/wiki/Avşa",
    "Q989883": "https://en.wikipedia.org/wiki/Büyükada",
    "Q2740733": "https://en.wikipedia.org/wiki/Cunda_Island",
    "Q3084314": "https://en.wikipedia.org/wiki/Uzunada",
    "Q2254939": "https://en.wikipedia.org/wiki/Kara_Ada_(Bodrum)",
    "Q2666727": "https://en.wikipedia.org/wiki/Kekova",
    "Q2119012": "https://en.wikipedia.org/wiki/Imia",
}

META_DESCRIPTION = (
    "Türkiye's maritime jurisdiction areas and notified limits. Mediterranean lines are "
    "Türkiye's position as notified to the UN (A/74/550, A/74/757) and the Türkiye–Libya MoU; "
    "features with status 'schematic' are areas constructed by this project from Türkiye's stated "
    "position, not official coordinates; features with status 'licence' are the TRNC's offshore licence "
    "areas A–G granted to TPAO (official coordinates, TRNC Official Gazette No. 161, 22 Sep 2011); "
    "see MARITIME-SOURCES.md.")

POS_TR = "Türkiye'nin tutumu"
POS_EN = "Türkiye's position"
MAX_BLACKSEA_VERTICES = 1600

# Canonical order of the features in maritime-tur.geojson (every build path writes this order,
# so partial rebuilds stay byte-identical to a full one). Unknown ids keep their relative order at the end.
FEATURE_ORDER = (["tur-blacksea-eez", "tur-marmara-straits", "tur-med-cs-a74550-a", "tur-med-cs-a74550-b",
                  "tur-med-cs-a74550-c", "tur-med-libya-mou", "tur-aegean-schematic", "tur-med-schematic"]
                 + [f"kktc-licence-{b}" for b in "ABCDEFG"] + ["tur-kktc-med-merged"])


def ordered(features: list[dict]) -> list[dict]:
    idx = {k: i for i, k in enumerate(FEATURE_ORDER)}
    return sorted(features, key=lambda f: idx.get(f["properties"].get("id"), len(idx)))


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def dms(s: str) -> float:
    d, m, sec = s.split("-")
    return int(d) + int(m) / 60 + float(sec) / 3600


def ll(lat: str, lon: str) -> tuple[float, float]:
    return (dms(lon), dms(lat))


def fetch(url: str, cache: Path, name: str) -> bytes:
    p = cache / name
    if not p.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as r:
            p.write_bytes(r.read())
    return p.read_bytes()


def load_land(cache: Path):
    raw = fetch(NE_LAND, cache, "ne_10m_land.zip")
    z = zipfile.ZipFile(io.BytesIO(raw))
    r = shapefile.Reader(shp=io.BytesIO(z.read("ne_10m_land.shp")),
                         shx=io.BytesIO(z.read("ne_10m_land.shx")),
                         dbf=io.BytesIO(z.read("ne_10m_land.dbf")))
    frame = box(18, 28, 46, 48)
    geoms = [shape(s.__geo_interface__) for s in r.shapes()
             if s.bbox[0] < 46 and s.bbox[2] > 18 and s.bbox[1] < 48 and s.bbox[3] > 28]
    return unary_union(geoms).intersection(frame)


def metres(pt: Point, geom) -> float:
    """Distance point→geometry in metres (local equirectangular; fine at < 50 km)."""
    k = math.cos(math.radians(pt.y))
    f = lambda x, y, z=None: ((x - pt.x) * k * 111320.0, (y - pt.y) * 110574.0)
    return shapely.ops.transform(f, geom).distance(Point(0, 0))


def rounded(geom):
    """Snap to a 1e-4° grid (valid output), then orient per RFC 7946."""
    g = shapely.set_precision(geom, 1e-4)
    if isinstance(g, Polygon):
        g = orient(g, 1.0)
    elif isinstance(g, MultiPolygon):
        g = MultiPolygon([orient(p, 1.0) for p in g.geoms])
    m = mapping(g)

    def r(c):
        return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], float) or isinstance(c[0], int) \
            else [r(x) for x in c]
    return {"type": m["type"], "coordinates": r(json.loads(json.dumps(m["coordinates"])))}


def nverts(geom) -> int:
    return len(shapely.get_coordinates(geom))


# --------------------------------------------------------------------------------------
# Components
# --------------------------------------------------------------------------------------
def black_sea(cache: Path, land, report: list[str]):
    fc = json.loads(fetch(MR_EEZ_TUR, cache, "mr_eez_5697.json"))
    assert len(fc["features"]) == 1, "expected exactly one MR feature for mrgid 5697"
    props = fc["features"][0]["properties"]
    assert props["geoname"] == "Turkish Exclusive Economic Zone", props["geoname"]
    eez = shape(fc["features"][0]["geometry"])

    frame = box(27.0, 40.5, 42.0, 44.5)
    marmara = unary_union([box(26.0, 39.5, 29.18, BOSPHORUS_LIMIT_LAT), box(26.0, 39.5, 31.0, 41.0)])
    bs = eez.intersection(frame).difference(marmara)
    bs = max(getattr(bs, "geoms", [bs]), key=lambda g: g.area)
    raw_vertices = nverts(bs)
    bs = bs.difference(land)                      # drop any sliver over NE 10m land
    bs = max(getattr(bs, "geoms", [bs]), key=lambda g: g.area)

    for tol in (0.001, 0.002, 0.003, 0.004, 0.005, 0.0075, 0.01):
        simp = bs.simplify(tol, preserve_topology=True)
        if nverts(simp) <= MAX_BLACKSEA_VERTICES:
            break
    geom = rounded(simp)
    final = shape(geom)
    report.append(f"Black Sea: MR vertices after clip {raw_vertices}, simplified tol={tol}° "
                  f"-> {nverts(final)} vertices; valid={final.is_valid}; "
                  f"area≈{final.area:.3f} deg²; overlap with NE10m land={final.intersection(land).area:.2e} deg²")

    # Cross-check against treaty turning points.
    ring = final.exterior
    rows = []
    for label, pts in (("TUR–USSR 1978", TUR_USSR_1978), ("TUR–BGR 1997", TUR_BGR_1997)):
        for i, (la, lo) in enumerate(pts, 1):
            p = Point(*ll(la, lo))
            rows.append((label, i, la, lo, metres(p, ring)))
    worst = max(r[4] for r in rows)
    report.append(f"Black Sea: max distance treaty turning point → polygon boundary = {worst:.0f} m")
    for r in rows:
        report.append(f"  {r[0]} pt {r[1]:2d}  {r[2]}N {r[3]}E  {r[4]:7.0f} m")

    return {
        "type": "Feature",
        "properties": {
            "id": "tur-blacksea-eez",
            "name_tr": "Karadeniz: Türkiye'nin münhasır ekonomik bölgesi ve kıta sahanlığı",
            "name_en": "Black Sea: Türkiye's exclusive economic zone and continental shelf",
            "basis_tr": ("1973 Türkiye–SSCB karasuları protokolü; 1978 Türkiye–SSCB kıta sahanlığı "
                         "sınırlandırma anlaşması (UNTS 20344); bu hattı MEB için de geçerli kılan "
                         "1986/87 nota teatisi (UNTS 24690); 1997 Türkiye–Bulgaristan anlaşması "
                         "(UNTS 36204); 1997 Türkiye–Gürcistan protokolü. MEB, 17 Aralık 1986 tarihli "
                         "86/11264 sayılı Bakanlar Kurulu Kararı ile ilan edildi."),
            "basis_en": ("1973 Turkey–USSR territorial-sea protocol; 1978 Turkey–USSR continental-shelf "
                         "delimitation agreement (UNTS 20344); 1986/87 exchange of notes applying that "
                         "line to the EEZ (UNTS 24690); 1997 Turkey–Bulgaria agreement (UNTS 36204); "
                         "1997 Turkey–Georgia protocol. EEZ declared by Council of Ministers Decree "
                         "86/11264 of 17 December 1986."),
            "status": "agreed",
            "contested": False,
            "geometry_source": ("Marine Regions (VLIZ) Maritime Boundaries, 'Turkish Exclusive Economic "
                                "Zone' (MRGID 5697), clipped to the Black Sea; includes the territorial sea"),
            "attribution": "© Flanders Marine Institute (VLIZ), MarineRegions.org — CC BY 4.0",
            "sources": [
                DOALOS_TUR,
                DOALOS_PDF + "TREATIES/GEO-TUR1973MB.PDF",
                DOALOS_PDF + "TREATIES/TUR-RUS1978CS.PDF",
                DOALOS_PDF + "TREATIES/RUS-TUR1987EZ.PDF",
                DOALOS_PDF + "TREATIES/TUR-BGR1997MB.PDF",
                DOALOS_PDF + "TREATIES/TUR-GEO1997BS.PDF",
                DOALOS_PDF + "TUR_1986_Decree.pdf",
                MR_EEZ_PAGE,
                MR_LICENCE,
            ],
        },
        "geometry": geom,
    }


def med_features(cache: Path, land, report: list[str]):
    fc = json.loads(fetch(MR_12NM_CYP, cache, "mr_12nm_cyprus.json"))
    assert len(fc["features"]) == 1 and fc["features"][0]["properties"]["geoname"] == "Cypriot 12 NM"
    cyp_ts = shape(fc["features"][0]["geometry"])

    a = LineString([ll(la, lo) for la, lo in A74550_A])
    b = LineString([ll(la, lo) for _, la, lo in A74550_B])
    c_full = LineString([ll(la, lo) for la, lo in A74550_C])
    c = c_full.difference(cyp_ts)
    if isinstance(c, LineString):
        c = MultiLineString([c])
    mou = LineString([ll(la, lo) for _, la, lo in MOU_LBY])

    # Continuity checks between sections (they share end points by construction).
    assert b.coords[-1] == c_full.coords[0] and c_full.coords[-1] == a.coords[0]
    for name, g in (("A/74/550 A", a), ("A/74/550 B", b), ("A/74/550 C", c), ("MoU", mou)):
        report.append(f"Med {name}: {nverts(g)} vertices; crosses NE10m land={g.intersects(land)}")
    removed = c_full.intersection(cyp_ts)
    report.append(f"Med section C: removed {removed.length:.4f}° of meridian inside Cyprus 12 nm (MR), "
                  f"lat {removed.bounds[1]:.4f}–{removed.bounds[3]:.4f}")

    common_srcs = [DOALOS_TUR, UNDOC + "A/74/550"]
    pos = {"position_tr": POS_TR, "position_en": POS_EN, "contested": True}

    return [
        {"type": "Feature", "properties": {
            "id": "tur-med-cs-a74550-a",
            "name_tr": "Doğu Akdeniz: Türkiye kıta sahanlığı dış sınırı (Türkiye–KKTC hattı, 32°16'18\"D – 34°36'28\"D)",
            "name_en": "Eastern Mediterranean: outer limit of Türkiye's continental shelf (Türkiye–TRNC line, 32°16'18\"E – 34°36'28\"E)",
            "basis_tr": ("Türkiye'nin BM'ye bildirdiği koordinatlar (A/74/550, ek, bölüm A): 21 Eylül 2011 "
                         "Türkiye–KKTC Kıta Sahanlığı Sınırlandırma Anlaşması ile belirlenen hat. KKTC'yi "
                         "yalnızca Türkiye tanır; hat GKRY ve Yunanistan tarafından itiraz edilmektedir."),
            "basis_en": ("Coordinates notified by Türkiye to the UN (A/74/550, annex, section A): line "
                         "established by the Türkiye–TRNC Continental Shelf Delimitation Agreement of "
                         "21 September 2011. The TRNC is recognised only by Türkiye; the line is "
                         "contested by the Greek Cypriot Administration and Greece."),
            "status": "claimed", **pos, "contested_by": ["GKRY / Republic of Cyprus", "Greece"],
            "geometry_kind": "limit-line",
            "sources": common_srcs}, "geometry": rounded(a)},
        {"type": "Feature", "properties": {
            "id": "tur-med-cs-a74550-b",
            "name_tr": "Doğu Akdeniz: Türkiye kıta sahanlığı dış sınırı (Türkiye–Mısır kıyıları arası orta hat, 28°D – 32°16'18\"D)",
            "name_en": "Eastern Mediterranean: outer limit of Türkiye's continental shelf (median line between the Turkish and Egyptian coasts, 28°E – 32°16'18\"E)",
            "basis_tr": ("Türkiye'nin BM'ye bildirdiği koordinatlar (A/74/550, ek, bölüm B, A–N noktaları). "
                         "Belgeye göre Türkiye ile Mısır arasında yapılacak ikili anlaşmaya tabidir ve "
                         "gelecekteki sınırlandırma anlaşmalarına göre gözden geçirilebilir."),
            "basis_en": ("Coordinates notified by Türkiye to the UN (A/74/550, annex, section B, points A–N). "
                         "Per the document, subject to a bilateral agreement to be reached between Turkey "
                         "and Egypt, and open to review in the light of future delimitation agreements."),
            "status": "claimed", **pos, "contested_by": ["Greece", "GKRY / Republic of Cyprus", "Egypt"],
            "geometry_kind": "limit-line",
            "sources": common_srcs}, "geometry": rounded(b)},
        {"type": "Feature", "properties": {
            "id": "tur-med-cs-a74550-c",
            "name_tr": "Doğu Akdeniz: Türkiye kıta sahanlığı dış sınırı (32°16'18\"D boylamı, yabancı karasuları hariç)",
            "name_en": "Eastern Mediterranean: outer limit of Türkiye's continental shelf (meridian 32°16'18\"E, excluding foreign territorial waters)",
            "basis_tr": ("A/74/550, ek, bölüm C: 35-33-09.584K ile 33-47-04.112K noktalarını 32°16'18\"D "
                         "boylamında birleştiren düz hat, 'yabancı karasuları hariç'. Kıbrıs adasının 12 "
                         "deniz millik karasuları Marine Regions verisiyle (CC BY 4.0) çıkarılmıştır."),
            "basis_en": ("A/74/550, annex, section C: straight line joining 35-33-09.584N and 33-47-04.112N "
                         "along 32°16'18\"E, 'except foreign territorial waters'. The island of Cyprus's "
                         "12-nm territorial sea is removed using Marine Regions data (CC BY 4.0)."),
            "status": "claimed", **pos, "contested_by": ["GKRY / Republic of Cyprus", "Greece"],
            "geometry_kind": "limit-line",
            "attribution": "Cyprus 12 nm cut-out: © Flanders Marine Institute (VLIZ), MarineRegions.org — CC BY 4.0",
            "sources": common_srcs + [MR_LICENCE]}, "geometry": rounded(c)},
        {"type": "Feature", "properties": {
            "id": "tur-med-libya-mou",
            "name_tr": "Türkiye–Libya Deniz Yetki Alanları Mutabakat Muhtırası sınırı (27 Kasım 2019)",
            "name_en": "Türkiye–Libya Memorandum of Understanding boundary on maritime jurisdiction areas (27 November 2019)",
            "basis_tr": ("Mutabakat Muhtırası Madde I(1): kıta sahanlığı ve MEB sınırı A noktası "
                         "(34°16'13.720\"K – 026°19'11.640\"D) ile B noktası (34°09'07.9\"K – 026°39'06.3\"D) "
                         "arasında (WGS84). 8 Aralık 2019'da yürürlüğe girdi; BM tescil no. 56119. "
                         "A/74/757'de aynı noktalar F ve E olarak anılır. İki taraflı olarak kabul edilmiş, "
                         "ancak Yunanistan, GKRY ve Mısır tarafından itiraz edilmektedir."),
            "basis_en": ("MoU Article I(1): the continental shelf/EEZ boundary runs from Point A "
                         "(34°16'13.720\"N – 026°19'11.640\"E) to Point B (34°09'07.9\"N – 026°39'06.3\"E) "
                         "(WGS84). In force 8 December 2019; UN registration no. 56119. A/74/757 refers to "
                         "the same points as F and E. Agreed bilaterally, but contested by Greece, the "
                         "Greek Cypriot Administration and Egypt."),
            "status": "agreed", **pos, "agreement": "bilateral (Türkiye–Libya GNA)",
            "contested_by": ["Greece", "GKRY / Republic of Cyprus", "Egypt"],
            "geometry_kind": "limit-line",
            "sources": [DOALOS_TUR,
                        DOALOS_PDF + "TREATIES/Turkey_11122019_%28HC%29_MoU_Libya-Delimitation-areas-Mediterranean.pdf",
                        UNDOC + "A/74/757"]}, "geometry": rounded(mou)},
    ]


def islands(land, report: list[str]):
    anatolia = next(g for g in land.geoms if g.contains(Point(32.85, 39.93)))  # Ankara
    feats = []
    for qid, tr, en, lat, lon in ISLANDS:
        p = Point(lon, lat)
        report.append(f"Island {tr:22s} {lat:.4f},{lon:.4f}  on NE10m land={land.contains(p)}  "
                      f"dist to NE10m land={metres(p, land):.0f} m")
        feats.append({"type": "Feature", "properties": {
            "name_tr": tr, "name_en": en, "kind": "island", "status": "tur",
            "wikidata": qid,
            "sources": [f"https://www.wikidata.org/wiki/{qid}", ISLAND_WIKI[qid]]},
            "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}})
    qid, tr, en, lat, lon = KARDAK
    p = Point(lon, lat)
    report.append(f"Kardak {lat:.4f},{lon:.4f}: distance to Anatolian mainland (NE10m) = "
                  f"{metres(p, anatolia) / 1852:.1f} nm (MFA: 3.8 miles)")
    feats.append({"type": "Feature", "properties": {
        "name_tr": tr, "name_en": en, "kind": "rocks", "status": "tur-position",
        "position_tr": POS_TR, "position_en": POS_EN, "contested": True, "contested_by": ["Greece"],
        "basis_tr": ("Türkiye'nin tutumu (T.C. Dışişleri Bakanlığı): Ege'de uluslararası antlaşmalarla "
                     "Yunanistan'a devredilmemiş ada, adacık ve kayalıklar (EGAYDAAK) bulunmaktadır; statüsü "
                     "uluslararası belgelerle açıkça belirlenmemiş küçük ada, adacık ve kayalıkların aidiyeti "
                     "henüz anlaşmayla belirlenmemiştir. Kardak Kayalıkları Türkiye kıyısından 3,8 mil "
                     "uzaklıktadır. (Bakanlığın İngilizce metninden çeviri.) Yunanistan bu görüşe "
                     "katılmamakta ve kayalıkları 'Imia' adıyla kendi egemenliğinde saymaktadır."),
        "basis_en": ("Türkiye's position (Ministry of Foreign Affairs): there are islands, islets and rocks "
                     "in the Aegean whose ownership was not ceded to Greece by international treaties; "
                     "\"the possession of small islands, islets and rocks in the Aegean the status of which "
                     "have not been clearly defined by international documents has yet to be determined by "
                     "agreement.\" The Kardak Rocks lie 3.8 miles off Türkiye's coast. Greece rejects this "
                     "position and regards the rocks ('Imia') as Greek territory."),
        "wikidata": qid,
        "sources": [MFA_KARDAK, MFA_EGAYDAAK, f"https://www.wikidata.org/wiki/{qid}", ISLAND_WIKI[qid]]},
        "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}})
    return feats


def write_fc(path: Path, features: list[dict], meta: dict):
    """One feature per line for readable diffs; UTF-8, no ASCII escaping."""
    head = json.dumps({"type": "FeatureCollection", **meta}, ensure_ascii=False)[:-1]
    body = ",\n".join(json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in features)
    path.write_text(head + ',"features":[\n' + body + "\n]}\n", encoding="utf-8", newline="\n")


def preview(png: Path, land, maritime: list[dict], isl: list[dict]):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(12, 7.2), dpi=110)
    for g in getattr(land, "geoms", [land]):
        x, y = g.exterior.xy
        ax.fill(x, y, color="#d9d6cf", lw=0.3, ec="#9a968d")
    colours = {"agreed": "#1f6fb2", "claimed": "#c2410c", "schematic": "#0e7490", "licence": "#b45309"}
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path as MPath
    for f in sorted(maritime, key=lambda f: f["properties"]["status"] != "schematic"):
        g = shape(f["geometry"]); st = f["properties"]["status"]
        if isinstance(g, (Polygon, MultiPolygon)):
            for p in getattr(g, "geoms", [g]):
                rings = [p.exterior] + list(p.interiors)   # draw holes (islands, territorial seas)
                verts = [c for r in rings for c in r.coords]
                codes = [c for r in rings for c in [MPath.MOVETO] + [MPath.LINETO] * (len(r.coords) - 1)]
                hatch = "////" if st == "schematic" else None
                ax.add_patch(PathPatch(MPath(verts, codes), fc=colours[st], alpha=0.25 if st != "schematic" else 0.18,
                                       lw=0.5 if st == "schematic" else 0.8, ec=colours[st], hatch=hatch))
        else:
            for l in getattr(g, "geoms", [g]):
                x, y = l.xy
                dash = "-" if f["properties"]["id"] == "tur-med-libya-mou" else "--"
                ax.plot(x, y, dash, color="#7c3aed" if dash == "-" else colours[st], lw=2)
    for f in isl:
        x, y = f["geometry"]["coordinates"]
        c = "#b91c1c" if f["properties"]["status"] == "tur-position" else "#111"
        ax.plot(x, y, "o", ms=3.5, color=c)
        ax.annotate(f["properties"]["name_tr"], (x, y), xytext=(3, 3), textcoords="offset points",
                    fontsize=6.5, color=c)
    ax.set_xlim(24.5, 42.5); ax.set_ylim(33.2, 44.2); ax.set_aspect(1 / math.cos(math.radians(38.5)))
    ax.set_title("maritime-tur.geojson + islands-tur.geojson — preview (blue: agreed; orange dashed: "
                 "claimed / Türkiye's position; purple: Libya MoU; hatched teal: schematic area, "
                 "not official coordinates; brown: TRNC licence areas A–G)", fontsize=8)
    ax.grid(lw=0.2)
    fig.tight_layout(); fig.savefig(png); plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "gt-geo-cache")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--preview", type=Path)
    ap.add_argument("--no-schematic", action="store_true",
                    help="skip the schematic Aegean/Eastern Mediterranean areas (build_maritime_schematic.py)")
    ap.add_argument("--no-kktc", action="store_true",
                    help="skip the TRNC licence areas A–G and the merged Türkiye+TRNC area (build_kktc_licences.py)")
    ap.add_argument("--no-marmara", action="store_true",
                    help="skip the Sea of Marmara and Turkish Straits area (build_marmara_straits.py)")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)

    report: list[str] = []
    land = load_land(args.cache)
    maritime = [black_sea(args.cache, land, report)] + med_features(args.cache, land, report)
    if not args.no_schematic:
        import build_maritime_schematic  # same directory; see that file for the construction
        maritime += build_maritime_schematic.build(args.cache, land, report)
    if not args.no_kktc:
        import build_kktc_licences  # licence areas A–G; merged area only if tur-med-schematic was built
        maritime += build_kktc_licences.build(args.cache, land, report, maritime)
    if not args.no_marmara and not args.no_schematic:
        import build_marmara_straits  # needs the Black Sea EEZ and the Aegean schematic area
        maritime += build_marmara_straits.build(args.cache, land, report, maritime)
    maritime = ordered(maritime)
    isl = islands(land, report)

    total = sum(nverts(shape(f["geometry"])) for f in maritime)
    for f in maritime:
        g = shape(f["geometry"])
        assert g.is_valid, f["properties"]["id"]
    report.append(f"maritime-tur.geojson: {len(maritime)} features, {total} vertices")

    meta_m = {"name": "maritime-tur", "description": META_DESCRIPTION}
    meta_i = {"name": "islands-tur", "description": "Türkiye's islands for labelling; see MARITIME-SOURCES.md."}
    write_fc(args.out / "maritime-tur.geojson", maritime, meta_m)
    write_fc(args.out / "islands-tur.geojson", isl, meta_i)
    if args.preview:
        preview(args.preview, land, maritime, isl)
    print("\n".join(report))


if __name__ == "__main__":
    main()
