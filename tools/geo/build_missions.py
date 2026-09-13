#!/usr/bin/env python3
"""Build apps/web/assets/data/missions-tur.geojson.

Türkiye's diplomatic missions abroad, placed at CITY level (never the building).

Sources
-------
1. Mission list: Republic of Türkiye Ministry of Foreign Affairs (MFA).
   The page https://www.mfa.gov.tr/yurtdisi-teskilati.tr.mfa
   ("Yurtdışındaki Temsilciliklerimiz") renders its list client-side from
   https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.tr.js
   and the English page https://www.mfa.gov.tr/turkish-representations.en.mfa
   from .../temsilcilikler.en.js. Both files are fetched and parsed here.
2. City coordinates: Wikidata (P625, best rank) via the SPARQL endpoint
   https://query.wikidata.org/sparql, for the city QIDs frozen in
   tools/geo/missions_city_qids.csv (one row per mission sub-domain; the
   QIDs were resolved by English label + country and reviewed by hand).
   Coordinates are rounded to 2 decimals on purpose (city-level only).

Usage
-----
    python tools/geo/build_missions.py            # writes the GeoJSON
    python tools/geo/build_missions.py --cache raw # also keeps raw downloads

Dependencies: Python 3.9+, requests.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "assets" / "data" / "missions-tur.geojson"
QID_CSV = Path(__file__).resolve().parent / "missions_city_qids.csv"

MFA_LIST_PAGE = "https://www.mfa.gov.tr/yurtdisi-teskilati.tr.mfa"
MFA_JS = {
    "tr": "https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.tr.js",
    "en": "https://www.mfa.gov.tr/site_media/assets/content/temsilcilikler/temsilcilikler.en.js",
}
SPARQL = "https://query.wikidata.org/sparql"
UA = "Greater-Turkiye-OSINT/0.1 (https://github.com/Greater-Turkiye/platform; dataset build)"

# MFA "misyonTurId" -> dataset kind. Only these are in scope.
KINDS = {
    30001: "embassy",            # Büyükelçilik
    30002: "consulate_general",  # Başkonsolosluk
    30003: "permanent_mission",  # Daimi Temsilcilik
}
# A plain "Konsolosluk" type would also be in scope; the MFA file currently has
# none, but map it by name if it ever appears.
KIND_BY_NAME = {"Konsolosluk": "consulate"}
# Out of scope (listed by the MFA, reported and skipped):
#   30004 Ticaret Ofisi (trade office), 30008 Konsolosluk Ajanlığı (consular
#   agency), 30009 Konsolosluk Bürosu (consular office). Honorary consulates are
#   not part of the MFA file at all.

# MFA country codes that are not ISO 3166-1 alpha-3.
COUNTRY_FIX = {
    "CYN": "XNC",  # KKTC / Turkish Republic of Northern Cyprus (project code)
    "KOS": "XKX",  # Kosovo (user-assigned code in common use; not in ISO 3166-1)
}

TR_SUFFIXES = (" Büyükelçiliği", " Başkonsolosluğu", " Konsolosluğu")


def fetch(url: str, session: requests.Session, **kw) -> requests.Response:
    for attempt in range(4):
        try:
            r = session.get(url, timeout=60, **kw)
            if r.status_code == 200:
                return r
        except requests.RequestException:
            pass
        time.sleep(5 * (attempt + 1))
    sys.exit(f"could not fetch {url}")


def parse_js(text: str) -> list[dict]:
    text = text.lstrip("﻿")
    return json.loads(text[text.index("["): text.rindex("]") + 1])


def web_key(rec: dict) -> str:
    return rec["url"].split("//", 1)[1].split(".mfa.gov.tr")[0].strip("/")


def load_qids() -> dict[str, dict]:
    with QID_CSV.open(encoding="utf-8") as f:
        return {row["web_key"]: row for row in csv.DictReader(f)}


def wikidata_cities(qids: list[str], session: requests.Session) -> dict[str, dict]:
    values = " ".join(f"wd:{q}" for q in sorted(set(qids)))
    query = f"""
SELECT ?item ?coord ?en ?tr WHERE {{
  VALUES ?item {{ {values} }}
  ?item wdt:P625 ?coord .
  OPTIONAL {{ ?item rdfs:label ?en FILTER(LANG(?en) = "en") }}
  OPTIONAL {{ ?item rdfs:label ?tr FILTER(LANG(?tr) = "tr") }}
}}"""
    r = session.post(
        SPARQL,
        data={"query": query, "format": "json"},
        headers={"Accept": "application/sparql-results+json"},
        timeout=300,
    )
    r.raise_for_status()
    out: dict[str, dict] = {}
    for b in r.json()["results"]["bindings"]:
        q = b["item"]["value"].rsplit("/", 1)[1]
        lon, lat = b["coord"]["value"].removeprefix("Point(").rstrip(")").split()
        pt = (round(float(lon), 2), round(float(lat), 2))
        rec = out.setdefault(q, {"points": set(), "en": None, "tr": None})
        rec["points"].add(pt)
        rec["en"] = rec["en"] or (b.get("en") or {}).get("value")
        rec["tr"] = rec["tr"] or (b.get("tr") or {}).get("value")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", help="directory to keep raw downloads")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    s = requests.Session()
    s.headers["User-Agent"] = UA

    raw = {}
    for lang, url in MFA_JS.items():
        raw[lang] = fetch(url, s).content.decode("utf-8-sig")
        time.sleep(2)
    if args.cache:
        cdir = Path(args.cache)
        cdir.mkdir(parents=True, exist_ok=True)
        for lang, txt in raw.items():
            (cdir / f"temsilcilikler.{lang}.js").write_text(txt, encoding="utf-8")

    tr = parse_js(raw["tr"])
    en = {d["misyonId"]: d for d in parse_js(raw["en"])}
    qmap = load_qids()

    kept, skipped = [], []
    for d in tr:
        kind = KINDS.get(d["misyonTurId"]) or KIND_BY_NAME.get(d["misyonTurAdi"])
        if not kind:
            skipped.append(d)
            continue
        kept.append((kind, d))

    missing = [web_key(d) for _, d in kept if web_key(d) not in qmap]
    if missing:
        sys.exit(f"no city QID for: {', '.join(missing)} (add rows to {QID_CSV.name})")

    cities = wikidata_cities([qmap[web_key(d)]["qid"] for _, d in kept], s)

    features = []
    for kind, d in kept:
        key = web_key(d)
        row = qmap[key]
        city = cities.get(row["qid"])
        if not city:
            sys.exit(f"Wikidata returned no coordinates for {row['qid']} ({key})")
        # Items with several best-rank P625 values: take the lowest (lon, lat)
        # after rounding so the output is deterministic.
        lon, lat = sorted(city["points"])[0]
        if row.get("city_tr"):
            city_tr = row["city_tr"]  # explicit override (see CSV note column)
        else:
            city_tr = d["misyonAdi"].strip()
            for suf in TR_SUFFIXES:
                city_tr = city_tr.removesuffix(suf)
            city_tr = city_tr.strip()
        city_en = row.get("city_en") or city["en"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": f"tur-{key}",
                "kind": kind,
                "name_tr": d["misyonAdi"].strip(),
                "name_en": (en.get(d["misyonId"]) or {}).get("misyonAdi", "").strip() or None,
                "city_tr": city_tr,
                "city_en": city_en,
                "city_wikidata": row["qid"],
                "country": COUNTRY_FIX.get(d["ulkeKod"], d["ulkeKod"]),
                "url": d["url"].replace("http://", "https://", 1),
                "source": MFA_LIST_PAGE,
                # e.g. relocation shown on the mission's own contact page
                "note": row.get("status_note") or None,
            },
        })

    features.sort(key=lambda f: (f["properties"]["country"], f["properties"]["city_en"],
                                 f["properties"]["kind"], f["properties"]["id"]))
    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "Türkiye's diplomatic missions abroad (city-level)",
            "retrieved": time.strftime("%Y-%m-%d"),
            "sources": [MFA_LIST_PAGE, *MFA_JS.values(), SPARQL],
            "note": "Points are city centroids from Wikidata (2-decimal rounding), "
                    "not building locations. See MISSIONS-SOURCES.md.",
        },
        "features": features,
    }
    Path(args.out).write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    counts: dict[str, int] = {}
    for f in features:
        counts[f["properties"]["kind"]] = counts.get(f["properties"]["kind"], 0) + 1
    print(f"wrote {len(features)} features to {args.out}: {counts}")
    for d in skipped:
        print(f"skipped (out of scope): {d['misyonTurAdi']} - {d['misyonAdi']} ({d['url']})")


if __name__ == "__main__":
    main()
