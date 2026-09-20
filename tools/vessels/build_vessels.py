"""Vessel identity as governments publish it: name, IMO number, flag, and the flag it used to fly.

    https://www.treasury.gov/ofac/downloads/sdn.xml     (OFAC Specially Designated Nationals)
    https://scsanctions.un.org/resources/xml/en/consolidated.xml   (UN Security Council)

The question this answers is "can a reflagging be documented?", and the answer is that two
authorities already document it. OFAC's list carries a `Former Vessel Flag` field; the UN list
carries vessel particulars for the ships it designates. Both are published so that third parties
can *identify* the ship, which is exactly the use made of them here.

What is taken: the identity of the ship — name, IMO number, MMSI, type, year of build, the flag as
recorded, any former or other flag, the owner as recorded, and which programme designated it.

What is never taken, from these or any other source: where the ship is, where it is going, when it
will arrive, or anything about its crew (handbook ADR 0022). Merchant ships in these waters are
being attacked, and a position published next to a cargo is what turns a compliance record into a
target list. A designation is already public and already identifies the ship; a position is not,
and does not.

The output keeps every designated vessel, because a filter is a claim about what matters and this
file should not make one. `watch` marks the ones whose flag, former flag or owner touches the
project's watch regions, so a reader can narrow it without the file having narrowed it first.

    python tools/vessels/build_vessels.py             # uses the cached downloads
    python tools/vessels/build_vessels.py --refresh   # fetches both lists again
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "assets" / "data" / "vessels-sanctioned.json"

SOURCES = {
    "ofac": "https://www.treasury.gov/ofac/downloads/sdn.xml",
    "un": "https://scsanctions.un.org/resources/xml/en/consolidated.xml",
}
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"

# Flags and ownership that touch the regions this project watches. Used only to mark a row, never
# to drop one: the file carries every designated vessel and lets the reader do the narrowing.
WATCH_WORDS = (
    "turkey", "türkiye", "turkish", "greece", "greek", "cyprus", "malta", "russia", "russian",
    "iran", "iranian", "syria", "syrian", "lebanon", "israel", "egypt", "libya", "ukraine",
    "georgia", "bulgaria", "romania", "azerbaijan",
)


def fetch(name: str, cache: Path, refresh: bool) -> bytes:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{name}.xml"
    if path.exists() and not refresh:
        return path.read_bytes()
    req = urllib.request.Request(SOURCES[name], headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read()
    except (urllib.error.URLError, TimeoutError) as e:
        raise SystemExit(f"{name}: {e}") from e
    path.write_bytes(body)
    return body


def tag(el: ET.Element) -> str:
    return el.tag.split("}")[-1]


def ofac_vessels(raw: bytes) -> list[dict]:
    """Every `sdnEntry` that carries a `vesselInfo` block, as identity only."""
    root = ET.fromstring(raw)
    out = []
    for entry in root:
        if tag(entry) != "sdnEntry":
            continue
        info = next((c for c in entry if tag(c) == "vesselInfo"), None)
        if info is None:
            continue
        ids: dict[str, list[str]] = {}
        for id_list in (c for c in entry if tag(c) == "idList"):
            for item in id_list:
                kind = next((y.text for y in item if tag(y) == "idType"), "") or ""
                number = next((y.text for y in item if tag(y) == "idNumber"), "") or ""
                ids.setdefault(kind, []).append(number)
        def field(name: str, block: ET.Element = info) -> str | None:
            return next((x.text for x in block if tag(x) == name), None)

        imo = (ids.get("Vessel Registration Identification") or [None])[0]
        out.append(
            {
                "name": next((x.text for x in entry if tag(x) == "lastName"), None),
                "imo": imo.replace("IMO", "").strip() if imo else None,
                "mmsi": (ids.get("MMSI") or [None])[0],
                "type": field("vesselType"),
                "built": (ids.get("Vessel Year of Build") or [None])[0],
                "flag": field("vesselFlag"),
                "former_flags": ids.get("Former Vessel Flag", []) + ids.get("Other Vessel Flag", []),
                "owner": field("vesselOwner"),
                "call_sign": field("callSign"),
                "programmes": [p.text for pl in entry if tag(pl) == "programList" for p in pl],
                "listed_by": "ofac",
            }
        )
    return out


def un_vessels(raw: bytes) -> list[dict]:
    """The UN list designates few vessels and describes them in prose; take what is structured."""
    root = ET.fromstring(raw)
    out = []
    for entry in root.iter():
        if tag(entry) != "INDIVIDUAL" and tag(entry) != "ENTITY":
            continue
        text = " ".join((e.text or "") for e in entry.iter() if e.text)
        if "IMO" not in text.upper():
            continue
        name = " ".join(
            (next((e.text for e in entry.iter() if tag(e) == f"{k}_NAME"), "") or "")
            for k in ("FIRST", "SECOND", "THIRD")
        ).strip()
        imo = None
        for token in text.replace(",", " ").split():
            digits = "".join(c for c in token if c.isdigit())
            if len(digits) == 7 and "IMO" in text.upper():
                imo = digits
                break
        out.append(
            {
                "name": name or None, "imo": imo, "mmsi": None, "type": None, "built": None,
                "flag": None, "former_flags": [], "owner": None, "call_sign": None,
                "programmes": [next((e.text for e in entry.iter() if tag(e) == "UN_LIST_TYPE"), None)],
                "listed_by": "un",
            }
        )
    return out


def watched(v: dict) -> bool:
    hay = " ".join(str(x) for x in (v["flag"], v["owner"], *v["former_flags"])).lower()
    return any(w in hay for w in WATCH_WORDS)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=os.environ.get("GT_VESSEL_CACHE", Path(tempfile.gettempdir()) / "gt-vessel-cache"),
    )
    ap.add_argument("--refresh", action="store_true", help="download both lists again")
    args = ap.parse_args()
    cache = Path(args.cache)

    vessels = ofac_vessels(fetch("ofac", cache, args.refresh))
    seen = {v["imo"] for v in vessels if v["imo"]}
    for v in un_vessels(fetch("un", cache, args.refresh)):
        if v["imo"] and v["imo"] in seen:
            continue  # already carried by the OFAC entry, which is the fuller record
        vessels.append(v)

    for v in vessels:
        v["watch"] = watched(v)
    vessels.sort(key=lambda v: (not v["former_flags"], v["flag"] or "zz", v["name"] or ""))

    changed = [v for v in vessels if v["former_flags"]]
    routes = Counter(
        (v["former_flags"][0], v["flag"]) for v in changed if v["former_flags"] and v["flag"]
    )
    data = {
        "about": (
            "Vessel identity as two authorities publish it: name, IMO number, flag, the flag it used "
            "to fly, and the owner as recorded. Both lists are published so that third parties can "
            "identify the ship, which is the only use made of them here. No position, no destination, "
            "no crew: the file has no such field and never will (ADR 0022). `watch` marks a vessel "
            "whose flag, former flag or owner touches this project's watch regions; nothing is "
            "dropped, because a filter is a claim about what matters."
        ),
        "source": {
            "ofac": {
                "name": "OFAC Specially Designated Nationals list",
                "url": SOURCES["ofac"],
                "terms": "Work of the United States Government: public domain",
            },
            "un": {
                "name": "UN Security Council consolidated list",
                "url": SOURCES["un"],
                "terms": "Published by the United Nations for implementation of the measures",
            },
        },
        "built_at": dt.datetime.now(tz=dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {
            "vessels": len(vessels),
            "with_imo": sum(1 for v in vessels if v["imo"]),
            "with_former_flag": len(changed),
            "watch": sum(1 for v in vessels if v["watch"]),
        },
        "flag_changes": [
            {"from": a, "to": b, "vessels": n} for (a, b), n in routes.most_common()
        ],
        "vessels": vessels,
    }
    OUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    print(
        f"{len(vessels)} vessels -> {OUT.relative_to(ROOT)}; "
        f"{len(changed)} with a recorded former flag, {data['counts']['watch']} touching the watch regions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
