#!/usr/bin/env python3
"""Sea of Marmara and the Turkish Straits (Istanbul and Çanakkale Straits) for maritime-tur.geojson.

Feature `tur-marmara-straits` (status "agreed", kind "internal-waters"): one area covering the
Istanbul Strait (Bosphorus), the Sea of Marmara and the Çanakkale Strait (Dardanelles).

Geometry:
  * IHO Sea Areas "Sea of Marmara" (IHO S-23, 1953; Marine Regions MRGID 3369, CC BY 4.0). Its
    limits include both straits: the Black Sea limit Rumeli Feneri – Anadolu Feneri at the northern
    entrance of the Istanbul Strait, and the Aegean limit Kumkale – Cape Helles (Mehmetçik Burnu) at
    the southern entrance of the Çanakkale Strait (both checked and reported by build()).
  * Clipped to water with Natural Earth 10m land, EXCEPT inside two strait corridors: at 1:10 million
    Natural Earth closes the Istanbul Strait (Europe and Asia form one land polygon) and narrows the
    Çanakkale Strait, so there the IHO polygon's own shoreline is used.
  * In the Istanbul Strait the feature stops at 41°13'N, where `tur-blacksea-eez` is cut, so the two
    share one straight grid edge; the strait north of it (up to the Türkeli–Anadolu line) is part of
    the Black Sea EEZ feature. The Black Sea EEZ and the Aegean schematic area are
    subtracted, so the feature joins them without overlap; simplified with SIMPLIFY_M (topology
    preserved, straits kept open), 1e-4° grid, RFC 7946 winding (like the Black Sea polygon).

Usage:
  python tools/geo/build_marmara_straits.py [--cache DIR]   # rewrites tur-marmara-straits in
      apps/web/assets/data/maritime-tur.geojson, keeps all other features
  (build_maritime.py and build_maritime_schematic.py call build() as well.)
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

import shapely
from pyproj import Geod
from shapely.geometry import MultiPolygon, Point, box, shape
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_maritime as bm  # noqa: E402
import build_maritime_schematic as bms  # noqa: E402

ID = "tur-marmara-straits"
# Sources
MFA_STRAITS = "https://www.mfa.gov.tr/the-turkish-straits.en.mfa"
MFA_MONTREUX = "https://www.mfa.gov.tr/implementation-of-the-montreux-convention.en.mfa"
MONTREUX_TEXT = "https://treaties.fcdo.gov.uk/data/Library2/pdf/1937-TS0030.pdf"   # UK Treaty Series No. 30 (1937)
MONTREUX_LNTS = "https://treaties.un.org/doc/Publication/UNTS/LON/Volume%20173/v173.pdf"
TUR_ACT_1982 = bm.DOALOS_PDF + "TUR_1982_Act.pdf"
TUR_REG_1994 = bm.DOALOS_PDF + "TUR_1994_Regulations.pdf"
MR_MARMARA = bms.MR_GAZ + str(bms.MR_IHO["marmara"])

# Parameters
BOSPHORUS_ZONE = (28.90, 40.98, 29.25, 41.25)     # IHO shoreline used here (NE 10m closes the strait)
DARDANELLES_ZONE = (26.10, 39.95, 26.75, 40.47)   # IHO shoreline used here (NE 10m narrows the strait)
SIMPLIFY_M = 100.0                                # as the Black Sea polygon (0.001° ≈ 100 m)
MIN_PART_KM2 = 5.0                                # drop detached pockets/slivers (as the schematic areas)
MIN_HALF_WIDTH_M = 250.0                          # continuity check: straits stay open after this erosion
AEGEAN_MARGIN_DEG = 1.2e-4                        # ≈ 13 m clearance from the Aegean schematic (see build())
BOSPHORUS_MOUTH = (29.125, 41.215)                # just south of the Black Sea EEZ edge (41°13'N)
DARDANELLES_MOUTH = (26.200, 40.020)              # just inside the Kumkale – Cape Helles line
NEIGHBOURS = ("tur-blacksea-eez", "tur-aegean-schematic")
GEOD = Geod(ellps="WGS84")


def km2(g) -> float:
    return abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6 if not g.is_empty else 0.0


def entrance_edge(poly, frame):
    """Longest edge of the IHO polygon inside `frame`: the limit line across a strait mouth."""
    c = shapely.get_coordinates(poly.exterior)
    best = None
    for a, b in zip(c[:-1], c[1:]):
        if frame.contains(Point(a)) and frame.contains(Point(b)):
            d = bm.metres(Point(a), Point(b))
            if best is None or d > best[0]:
                best = (d, a, b)
    return best


def build(cache: Path, land, report: list[str], maritime: list[dict]) -> list[dict]:
    iho = bms.load_iho(cache)
    marmara = iho["marmara"]
    by_id = {f["properties"]["id"]: f for f in maritime}
    missing = [k for k in NEIGHBOURS if k not in by_id]
    assert not missing, f"tur-marmara-straits needs {missing} (build them first)"
    nb = unary_union([shape(by_id[k]["geometry"]) for k in NEIGHBOURS])

    for name, fr in (("Istanbul Strait (Black Sea limit)", box(29.0, 41.18, 29.25, 41.26)),
                     ("Çanakkale Strait (Aegean limit)", box(26.1, 39.97, 26.3, 40.07))):
        d, a, b = entrance_edge(marmara, fr)
        report.append(f"Marmara: IHO {name}: {a[1]:.4f}N {a[0]:.4f}E – {b[1]:.4f}N {b[0]:.4f}E ({d:.0f} m)")

    corridors = unary_union([box(*BOSPHORUS_ZONE), box(*DARDANELLES_ZONE)])
    water = unary_union([marmara.difference(land), marmara.intersection(corridors)])
    # The Black Sea EEZ is cut at 41°13'N in the Istanbul Strait (build_maritime.BOSPHORUS_LIMIT_LAT, a
    # grid line): stop there as well, so the two share one straight edge and touch without overlap.
    # The strait north of it (up to the Türkeli–Anadolu line, 0.3–1.8 km) is drawn by tur-blacksea-eez.
    bos_north = box(BOSPHORUS_ZONE[0], bm.BOSPHORUS_LIMIT_LAT, BOSPHORUS_ZONE[2], 41.6)
    g = water.difference(bos_north).difference(nb)
    g = bms.to_deg(bms.to_m(g).simplify(SIMPLIFY_M, preserve_topology=True))
    g = shapely.set_precision(g, 1e-4)                         # snap-round to the 1e-4° grid (valid)
    # Overlaps are handled in plain floating precision: a geometry that carries the 1e-4 precision model
    # makes GEOS evaluate intersections snap-rounded, which hides metre-wide slivers. At the Çanakkale mouth
    # this area and the Aegean schematic run along the same IHO line ~1 m apart, so the Aegean area is
    # subtracted with a margin (AEGEAN_MARGIN_DEG ≈ 13 m) larger than the 4-decimal rounding shift (≤ 7.1e-5°);
    # the Black Sea EEZ is joined exactly along the 41°13'N grid line.
    g = shape(bms.geojson_geom(g))                              # drop the precision model (4 decimals)
    eez = shape(by_id["tur-blacksea-eez"]["geometry"])
    aeg = shape(by_id["tur-aegean-schematic"]["geometry"])
    g = g.difference(eez).difference(aeg.buffer(AEGEAN_MARGIN_DEG, quad_segs=4))
    g = shapely.make_valid(shape(bms.geojson_geom(g)))         # round the new cut vertices to 4 decimals
    keep = [p for p in bms.parts(g) if p.geom_type == "Polygon" and km2(p) >= MIN_PART_KM2]
    slivers = [p for p in bms.parts(g) if p.geom_type == "Polygon" and km2(p) < MIN_PART_KM2]
    assert len(keep) == 1, [round(km2(p), 3) for p in keep]
    geom = bms.geojson_geom(shapely.orient_polygons(keep[0], exterior_cw=False))   # RFC 7946 winding
    final = shape(geom)

    # checks
    assert final.is_valid and final.geom_type == "Polygon"
    for f in maritime:
        if f["properties"]["id"] != ID and "Polygon" in f["geometry"]["type"]:
            ov = final.intersection(shape(f["geometry"])).area
            assert ov < 1e-12, (f["properties"]["id"], ov)
    assert final.distance(shape(by_id["tur-blacksea-eez"]["geometry"])) == 0.0, "does not join the Black Sea EEZ"
    gap_aeg = final.distance(shape(by_id["tur-aegean-schematic"]["geometry"]))
    assert gap_aeg < 3e-4, gap_aeg                             # joins the Aegean area (≤ ~30 m, i.e. the margin)
    for pt in (BOSPHORUS_MOUTH, DARDANELLES_MOUTH):
        assert final.contains(Point(pt)), pt
    eroded = bms.to_deg(bms.to_m(final).buffer(-MIN_HALF_WIDTH_M))
    core = max(bms.parts(eroded), key=lambda p: p.area)
    reach = [bm.metres(Point(pt), core) for pt in (BOSPHORUS_MOUTH, DARDANELLES_MOUTH)]
    assert max(reach) < 2000, reach
    report.append(f"Marmara: IHO 'Sea of Marmara' {km2(marmara):,.0f} km² (∩ NE 10m land {km2(marmara.intersection(land)):.0f} km²); "
                  f"feature {km2(final):,.0f} km², {bm.nverts(final)} vertices, 1 part (dropped {len(slivers)} sliver(s), "
                  f"{sum(km2(p) for p in slivers):.3f} km²); ∩ NE 10m land {km2(final.intersection(land)):.1f} km² (straits "
                  f"corridors); overlap with other features 0; joins the Black Sea EEZ (distance 0) and the Aegean schematic "
                  f"(gap {gap_aeg * 111320:.0f} m); both straits stay open after a {MIN_HALF_WIDTH_M:g} m erosion "
                  f"(≥ {2 * MIN_HALF_WIDTH_M:g} m wide)")

    props = {
        "id": ID,
        "name_tr": "Marmara Denizi ve Türk Boğazları (İstanbul Boğazı, Çanakkale Boğazı)",
        "name_en": "Sea of Marmara and the Turkish Straits (Istanbul Strait, Çanakkale Strait)",
        "status": "agreed",
        "kind": "internal-waters",
        "basis_tr": ("Türk Boğazları; İstanbul Boğazı, Marmara Denizi ve Çanakkale Boğazı'ndan oluşan su yolları sistemidir "
                     "(T.C. Dışişleri Bakanlığı). Kıyılarının tamamı Türkiye'ye ait olan Marmara Denizi Türk iç sularıdır; "
                     "İstanbul ve Çanakkale Boğazları Türk karasularıdır. Türkiye'nin egemenliği kara ülkesinin ötesinde "
                     "karasularına uzanır; esas hatların kara tarafındaki sular ve körfezler iç sulardır (2674 sayılı "
                     "Karasuları Kanunu, 20 Mayıs 1982, md. I ve IV). Boğazlardan geçiş, 20 Temmuz 1936 tarihli Montrö "
                     "Boğazlar Rejimine İlişkin Sözleşme ile düzenlenir: ticaret gemileri için geçiş ve seyir serbestisi, "
                     "savaş gemileri için özel kurallar; Sözleşme 'Boğazlar' terimini Çanakkale Boğazı, Marmara Denizi ve "
                     "İstanbul Boğazı için kullanır. Deniz trafiği Türk Boğazları ve Marmara Bölgesi Deniz Trafik Düzeni "
                     "Tüzüğü ile düzenlenir (1 Temmuz 1994)."),
        "basis_en": ("The Turkish Straits are a system of waterways consisting of the Istanbul Strait, the Sea of Marmara and "
                     "the Çanakkale Strait (Ministry of Foreign Affairs). The Sea of Marmara, whose coasts are entirely "
                     "Turkish, is Turkish internal waters; the Istanbul and Çanakkale Straits are Turkish territorial waters. "
                     "Türkiye's sovereignty extends beyond its land territory to its territorial sea, and the waters on the "
                     "land side of the baselines and the waters of bays are internal waters (Act No. 2674 on the Territorial "
                     "Sea, 20 May 1982, Arts. I and IV). Passage through the Straits is governed by the Montreux Convention "
                     "Regarding the Regime of the Straits of 20 July 1936: freedom of transit and navigation for merchant "
                     "vessels, specific rules for warships; the Convention uses the term 'Straits' for the Dardanelles, the "
                     "Sea of Marmara and the Bosphorus. Traffic is governed by the Maritime Traffic Regulations for the "
                     "Turkish Straits and the Marmara Region (in force 1 July 1994)."),
        "position_tr": "Türkiye'nin iç suları (Marmara Denizi) ve karasuları (İstanbul ve Çanakkale Boğazları); geçiş rejimi: 1936 Montrö Sözleşmesi",
        "position_en": "Türkiye's internal waters (Sea of Marmara) and territorial waters (Istanbul and Çanakkale Straits); passage regime: 1936 Montreux Convention",
        "contested": False,
        "area_km2": round(km2(final)),
        "geometry_source": ("Marine Regions (VLIZ) IHO Sea Areas 'Sea of Marmara' (MRGID 3369). Its limits at the strait "
                            "mouths are the entrance lines of the 1994 Straits Regulations (Art. 2(l), (o)): Anadolu "
                            "Lighthouse – Türkeli (Rumeli) Lighthouse, and Mehmetçik Cape Lighthouse – Kumkale Lighthouse. "
                            "Clipped with Natural Earth 10m land "
                            "except in the two straits (IHO shoreline kept there), the Black Sea EEZ and the Aegean schematic "
                            "area subtracted (the Istanbul Strait north of 41°13'N, up to the Türkeli–Anadolu line, is "
                            f"drawn as part of tur-blacksea-eez, which is cut there), simplified {SIMPLIFY_M:g} m"),
        "attribution": "IHO Sea Areas: © Flanders Marine Institute (VLIZ), MarineRegions.org — CC BY 4.0; coastlines: Natural Earth (public domain)",
        "sources": [MFA_STRAITS, MFA_MONTREUX, MONTREUX_TEXT, MONTREUX_LNTS, TUR_ACT_1982, TUR_REG_1994, bm.DOALOS_TUR,
                    MR_MARMARA, bm.MR_LICENCE, bm.NE_LAND],
    }
    return [{"type": "Feature", "properties": props, "geometry": geom}]


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
    keep = [f for f in fc["features"] if f["properties"].get("id") != ID]
    feats = bm.ordered(keep + build(args.cache, land, report, keep))
    meta = {k: v for k, v in fc.items() if k not in ("type", "features")}
    meta["description"] = bm.META_DESCRIPTION
    bm.write_fc(path, feats, meta)
    print("\n".join(report))


if __name__ == "__main__":
    main()
