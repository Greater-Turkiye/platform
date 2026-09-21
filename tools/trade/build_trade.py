"""Türkiye's declared halt of trade with Israel, against what both states' own statistics record.

    https://comtradeapi.un.org/public/v1/preview/C/M/HS   (UN Comtrade, public preview, no key)

On 9 April 2024 Türkiye restricted the export of 54 product groups to Israel, and on 2 May 2024 it
announced that trade in both directions had been halted. This builder does not judge whether that
was kept: it puts the two sides' own monthly figures next to each other and lets the gap between
them be read.

Two things make the comparison meaningful, and both are the reason it is done this way:

* **Each state reports its own side.** Türkiye reports exports by country of *destination*; Israel
  reports imports by country of *origin*. Before the halt the two lines agree to within a few per
  cent, which is what makes the series after it worth reading: a Turkish-made good shipped through
  a third country is an export to that country in Türkiye's books and an import of Turkish origin
  in Israel's. The gap is therefore a **measurement of routing**, not an accusation, and the record
  says so in those words.
* **Absence is not zero.** A month with no Israel line in Türkiye's returns could mean no trade or
  no report. Every such month is checked against the same month's Germany line: when Türkiye
  reported Germany and not Israel, the absence is a reported absence, and the output marks it
  `reported: true`. Nothing is published as a fall to zero unless that check passed.

The mode of transport comes with the figures (UN mode codes: 2100 sea, 1000 air, 3200 road), so the
share that moved by sea is read from the statistics rather than inferred from anything else.

    python tools/trade/build_trade.py             # uses the cached downloads
    python tools/trade/build_trade.py --refresh   # fetches again (about ten minutes: one call a month)

Nothing here tracks a vessel. Live positions of civilian ships are out of scope permanently
(handbook ADR 0022): merchant ships in this region are being attacked, and a position is the one
piece of information that turns a compliance record into a target list.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps" / "web" / "assets" / "data" / "trade-il.json"

API = "https://comtradeapi.un.org/public/v1/preview/C/M/HS"
USER_AGENT = "GreaterTurkiye-OSINT/0.1 (+https://github.com/Greater-Turkiye)"
PAUSE_S = 2.5  # the public preview endpoint rate-limits; this keeps a full run under its threshold

TUR, ISR, DEU = 792, 376, 276
FIRST_YEAR, FIRST_MONTH = 2023, 1

# UN mode-of-transport codes, from reference/ModeOfTransportCodes.json
MODES = {"1000": "air", "2100": "sea", "3100": "rail", "3200": "road"}

# What was announced, and when. These two dates frame the series, and they are carried the way any
# other unverified claim is carried in this project: the primary source is not attached yet. The
# ministry's own announcement pages do not answer a plain HTTP client, so a citation would have to
# be taken from a secondary report, and an unsourced date next to sourced figures would be the
# weakest thing in the file. The figures do not depend on the dates being exact: the series shows
# for itself where the Turkish line stops.
POLICY = [
    {
        "date": "2024-04-09",
        "tr": "54 ürün grubunda İsrail'e ihracat kısıtlandı (Ticaret Bakanlığı).",
        "en": "Exports to Israel restricted in 54 product groups (Ministry of Trade).",
        "source": None,
        "status": "birincil kaynak bekliyor / primary source not attached",
    },
    {
        "date": "2024-05-02",
        "tr": "İsrail ile ticaretin iki yönde de durdurulduğu açıklandı (Ticaret Bakanlığı).",
        "en": "Trade with Israel announced as halted in both directions (Ministry of Trade).",
        "source": None,
        "status": "birincil kaynak bekliyor / primary source not attached",
    },
]


def months(first_year: int, first_month: int) -> list[str]:
    import datetime as dt

    out, cur = [], dt.date(first_year, first_month, 1)
    # Comtrade publishes a month some weeks after it ends; ask up to two months back from today
    end = dt.datetime.now(tz=dt.UTC).date().replace(day=1) - dt.timedelta(days=62)
    end = end.replace(day=1)
    while cur <= end:
        out.append(f"{cur.year}{cur.month:02d}")
        cur = (cur.replace(day=28) + dt.timedelta(days=7)).replace(day=1)
    return out


def fetch(period: str, reporter: int, partner: int, flow: str, cache: Path, refresh: bool,
          cmd: str = "TOTAL") -> list[dict]:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{reporter}-{partner}-{flow}-{period}-{cmd}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8")).get("data", [])
    url = (
        f"{API}?reporterCode={reporter}&period={period}&partnerCode={partner}"
        f"&flowCode={flow}&cmdCode={cmd}"
    )
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
            path.write_bytes(body)
            time.sleep(PAUSE_S)
            return json.loads(body).get("data", [])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(4 + attempt * 3)
                continue
            raise SystemExit(f"{period} {reporter}->{partner} {flow}: HTTP {e.code}")
        except (urllib.error.URLError, TimeoutError):
            time.sleep(4 + attempt * 3)
    raise SystemExit(f"{period} {reporter}->{partner} {flow}: gave up after rate limiting")


def total_and_modes(rows: list[dict]) -> tuple[float | None, dict[str, float]]:
    """The all-modes, all-customs-procedures figure, and the split by mode of transport.

    The API returns one row per mode of transport, per customs procedure and — for a query against
    the world — per second partner; summing them double-counts several times over. The statistic is
    the single undivided row: mode 0, procedure C00, second partner 0."""
    total = None
    modes: dict[str, float] = {}
    for r in rows:
        if str(r.get("customsCode") or "C00") != "C00":
            continue
        # A query can also carry second-partner breakdowns; only the undivided row is the statistic.
        if str(r.get("partner2Code") or "0") != "0":
            continue
        mot = str(r.get("motCode"))
        value = r.get("primaryValue")
        if value is None:
            continue
        if mot == "0":
            total = float(value)
        elif mot in MODES:
            modes[MODES[mot]] = float(value)
    return total, modes


# Where a Turkish export could be recorded instead. These are neighbours and transit economies, not
# accusations: the list exists so the same question is asked of every plausible line rather than of
# the one that gives the answer somebody wanted.
ROUTE_PARTNERS = {
    "300": ("Greece", "Yunanistan"), "470": ("Malta", "Malta"), "196": ("Cyprus", "GKRY"),
    "818": ("Egypt", "Mısır"), "400": ("Jordan", "Ürdün"),
    "784": ("United Arab Emirates", "BAE"), "100": ("Bulgaria", "Bulgaristan"),
    "642": ("Romania", "Romanya"), "275": ("Palestine", "Filistin"),
    "268": ("Georgia", "Gürcistan"), "422": ("Lebanon", "Lübnan"), "760": ("Syria", "Suriye"),
}
WINDOW_BEFORE = [f"{y}{m:02d}" for y, m in
                 [(2023, m) for m in range(5, 13)] + [(2024, m) for m in range(1, 5)]]
WINDOW_AFTER = [f"{y}{m:02d}" for y, m in
                [(2024, m) for m in range(6, 13)] + [(2025, m) for m in range(1, 6)]]


def mean_exports(partner: int, window: list[str], cache: Path, refresh: bool) -> tuple[int | None, int]:
    values = []
    for period in window:
        total, _ = total_and_modes(fetch(period, TUR, partner, "X", cache, refresh))
        if total is not None:
            values.append(total)
    return (round(sum(values) / len(values)) if values else None), len(values)


# Which goods, not just how much. Israel reports both windows, so the comparison is like with like:
# taking Türkiye's own chapters before the halt and Israel's after it would compare two different
# accounting bases and call the difference a finding.
CHAPTERS_URL = "https://comtradeapi.un.org/files/v1/app/reference/HS.json"
CHAPTER_BEFORE = [f"{y}{m:02d}" for y, m in
                  [(2023, m) for m in range(5, 13)] + [(2024, m) for m in range(1, 5)]]
CHAPTER_AFTER = [f"{y}{m:02d}" for y, m in
                 [(2025, m) for m in range(8, 13)] + [(2026, m) for m in range(1, 8)]]

# Turkish names for the chapters this series actually carries. The English text is the official one
# the UN publishes; the Turkish is the customs tariff's own wording, shortened to what fits a row.
CHAPTER_TR = {
    "08": "Meyveler ve sert kabuklu meyveler",
    "15": "Hayvansal ve bitkisel yağlar",
    "19": "Hububat, un ve nişasta müstahzarları",
    "20": "Sebze, meyve ve bitki müstahzarları",
    "22": "İçecekler, alkollü içkiler ve sirke",
    "25": "Tuz, kükürt, toprak, taş, alçı, kireç ve çimento",
    "30": "Eczacılık ürünleri",
    "26": "Metal cevherleri, cüruf ve kül",
    "27": "Mineral yakıtlar ve yağlar",
    "28": "İnorganik kimyasallar",
    "29": "Organik kimyasallar",
    "31": "Gübreler",
    "32": "Boya, vernik ve pigmentler",
    "33": "Uçucu yağlar, parfümeri ve kozmetik",
    "34": "Sabun, yüzey aktif maddeler, mumlar",
    "35": "Albüminoid maddeler, tutkallar, enzimler",
    "38": "Muhtelif kimyasal ürünler",
    "39": "Plastikler ve mamulleri",
    "40": "Kauçuk ve mamulleri",
    "44": "Ağaç ve ahşap eşya",
    "48": "Kâğıt, karton ve mamulleri",
    "49": "Basılı kitap, gazete ve matbuat",
    "52": "Pamuk",
    "54": "Sentetik ve suni filamentler",
    "55": "Sentetik ve suni devamsız lifler",
    "56": "Vatka, keçe, ip ve halat",
    "57": "Halılar ve diğer yer kaplamaları",
    "58": "Özel dokumalar, dantel, işlemeler",
    "59": "Emdirilmiş, kaplanmış dokumalar",
    "60": "Örme kumaşlar",
    "61": "Örme giyim eşyası",
    "62": "Örme olmayan giyim eşyası",
    "63": "Diğer hazır tekstil eşyası",
    "64": "Ayakkabı ve aksamı",
    "68": "Taş, alçı, çimento ve amyant mamulleri",
    "69": "Seramik ürünleri",
    "70": "Cam ve cam eşya",
    "71": "Kıymetli taş ve metaller, mücevherat",
    "72": "Demir ve çelik",
    "73": "Demir veya çelikten eşya",
    "74": "Bakır ve bakırdan eşya",
    "76": "Alüminyum ve alüminyumdan eşya",
    "82": "Aletler, bıçakçı eşyası, çatal-kaşık",
    "83": "Adi metallerden çeşitli eşya",
    "84": "Makineler, mekanik cihazlar, kazanlar",
    "85": "Elektrikli makine ve cihazlar",
    "86": "Demiryolu taşıtları ve donanımı",
    "87": "Kara taşıtları ve aksamı",
    "89": "Gemiler ve suda yüzen araçlar",
    "90": "Optik, ölçü ve tıbbi cihazlar",
    "94": "Mobilya, yatak, aydınlatma cihazları",
    "95": "Oyuncaklar, oyun ve spor malzemeleri",
    "96": "Çeşitli mamul eşya",
    "99": "Türü belirtilmemiş eşya",
}


def chapter_names(cache: Path, refresh: bool) -> dict[str, str]:
    """The UN's own text for each two-digit chapter, cached with the rest of the downloads."""
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / "hs-chapters.json"
    if not path.exists() or refresh:
        req = urllib.request.Request(CHAPTERS_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    rows = json.loads(path.read_text(encoding="utf-8")).get("results", [])
    out = {}
    for row in rows:
        code = str(row.get("id") or "")
        if len(code) != 2:
            continue
        text = str(row.get("text") or "")
        # the reference prints "72 - Iron and steel"; the code is already the key
        out[code] = text.split(" - ", 1)[-1].strip()
    return out


def chapters_of(rows: list[dict]) -> dict[str, float]:
    """The undivided figure for each two-digit chapter in one month's reply."""
    out: dict[str, float] = {}
    for r in rows:
        if str(r.get("customsCode") or "C00") != "C00":
            continue
        if str(r.get("partner2Code") or "0") != "0":
            continue
        if str(r.get("motCode")) != "0":
            continue
        code = str(r.get("cmdCode") or "")
        if len(code) != 2 or not code.isdigit():
            continue
        value = r.get("primaryValue")
        if value is not None:
            out[code] = out.get(code, 0.0) + float(value)
    return out


def build_chapters(cache: Path, refresh: bool) -> dict:
    """What arrives, by chapter, before and after the halt — both from Israel's own returns."""
    names = chapter_names(cache, refresh)
    windows = {"before": CHAPTER_BEFORE, "after": CHAPTER_AFTER}
    totals: dict[str, dict[str, float]] = {}
    months = {"before": 0, "after": 0}
    by_month: dict[str, list[float]] = {}  # the after window, kept month by month
    for label, window in windows.items():
        for period in window:
            rows = fetch(period, ISR, TUR, "M", cache, refresh, cmd="AG2")
            month = chapters_of(rows)
            if not month:
                continue
            months[label] += 1
            for code, value in month.items():
                totals.setdefault(code, {"before": 0.0, "after": 0.0})[label] += value
            if label == "after":
                for code in set(list(totals) + list(month)):
                    by_month.setdefault(code, []).append(month.get(code, 0.0))

    out = []
    for code, sums in totals.items():
        before = sums["before"] / months["before"] if months["before"] else None
        after = sums["after"] / months["after"] if months["after"] else None
        series = by_month.get(code, [])
        present = sum(1 for v in series if v > 0)
        top_share = max(series) / sums["after"] if series and sums["after"] else 0.0
        out.append({
            "chapter": code,
            "name": names.get(code, code),
            "name_tr": CHAPTER_TR.get(code, names.get(code, code)),
            "before": round(before) if before else 0,
            "after": round(after) if after else 0,
            "change_pct": round(100 * (after - before) / before, 1) if (before and after is not None) else None,
            # A chapter can be a flow or a single delivery, and a monthly average hides which:
            # 105 M$ of ships in one month of eleven averages to 10 M$ a month and reads as trade.
            "months_present": present,
            "top_month_share": round(top_share, 3),
            "lumpy": bool(top_share > 0.6 and present <= 3),
        })
    out.sort(key=lambda c: -c["after"])
    return {
        "about": (
            "What still arrives in Israel recorded as Turkish origin, by HS chapter, as monthly "
            "averages. Both windows are read from Israel's own returns so they are comparable: "
            "taking Türkiye's chapters before the halt and Israel's after it would compare two "
            "accounting bases and call the difference a finding. A chapter is a wide category — "
            "'iron and steel' is not a single product — and the figures say what arrived, never "
            "by which route or on whose ship. `lumpy` marks a chapter whose window is one delivery "
            "rather than a flow: a single 105 M$ month of ships averages to 10 M$ a month and would "
            "otherwise read as trade."
        ),
        "windows": {"before": [CHAPTER_BEFORE[0], CHAPTER_BEFORE[-1]],
                    "after": [CHAPTER_AFTER[0], CHAPTER_AFTER[-1]]},
        "months_with_data": months,
        "reporter": "Israel (376), imports from Türkiye (792)",
        "chapters": out,
    }


def build_routes(cache: Path, refresh: bool) -> dict:
    """Türkiye's own monthly exports to its neighbours, twelve months before the halt and twelve after.

    A line that grew is not a route: goods are not tracked from one statistic to another, and a
    neighbour's economy grows for its own reasons. What the comparison can say is which lines moved
    while Israel kept recording imports of Turkish origin — which is where anyone checking the halt
    would look next, and which lines are not worth looking at."""
    # Everything grew: Türkiye's exports as a whole moved between the two windows, and a partner
    # that merely kept pace with that has told us nothing. Each line is therefore also reported
    # against the total, so what is left is the part that is not the general trend.
    world_before, _ = mean_exports(0, WINDOW_BEFORE, cache, refresh)
    world_after, _ = mean_exports(0, WINDOW_AFTER, cache, refresh)
    world_pct = round(100 * (world_after - world_before) / world_before, 1) if world_before else None
    print(f"  Türkiye's total exports: {world_pct}%", flush=True)

    out = {}
    for code, (name, name_tr) in ROUTE_PARTNERS.items():
        means = {}
        for label, window in (("before", WINDOW_BEFORE), ("after", WINDOW_AFTER)):
            means[label], means[f"{label}_months"] = mean_exports(int(code), window, cache, refresh)
        b, a = means["before"], means["after"]
        means["change_pct"] = round(100 * (a - b) / b, 1) if (a and b) else None
        means["change_usd"] = a - b if (a is not None and b is not None) else None
        # the growth left over once Türkiye's own overall growth is taken out
        means["excess_pct"] = (
            round(means["change_pct"] - world_pct, 1)
            if (means["change_pct"] is not None and world_pct is not None) else None
        )
        means["excess_usd"] = (
            round(a - b * (1 + world_pct / 100))
            if (a is not None and b is not None and world_pct is not None) else None
        )
        out[code] = {"name": name, "name_tr": name_tr, **means}
        print(f"  {name}: {means.get('change_pct')}% ({means.get('excess_pct')}% over the trend)", flush=True)
    return {
        "about": (
            "Türkiye's own monthly exports to its neighbours and transit economies, averaged over the "
            "twelve months before the halt (2023-05 to 2024-04) and the twelve after it (2024-06 to "
            "2025-05). A line that grew is not a route: nothing is traced from one statistic to another, "
            "and every economy grows for its own reasons. The comparison says where a check would look "
            "next, and where it would not."
        ),
        "windows": {"before": [WINDOW_BEFORE[0], WINDOW_BEFORE[-1]], "after": [WINDOW_AFTER[0], WINDOW_AFTER[-1]]},
        "all_exports": {"before": world_before, "after": world_after, "change_pct": world_pct},
        "partners": out,
    }


def build(cache: Path, refresh: bool) -> dict:
    series = []
    for period in months(FIRST_YEAR, FIRST_MONTH):
        tr_x, tr_x_modes = total_and_modes(fetch(period, TUR, ISR, "X", cache, refresh))
        tr_m, _ = total_and_modes(fetch(period, TUR, ISR, "M", cache, refresh))
        il_m, il_m_modes = total_and_modes(fetch(period, ISR, TUR, "M", cache, refresh))
        # Absence is only a reported absence when the same month carries other partners.
        control = None
        if tr_x is None or tr_m is None:
            control, _ = total_and_modes(fetch(period, TUR, DEU, "X", cache, refresh))
        series.append(
            {
                "period": period,
                "tur_exports_to_isr": tr_x,
                "tur_imports_from_isr": tr_m,
                "isr_imports_from_tur": il_m,
                "tur_reported_that_month": control is not None and control > 0 if control is not None else True,
                "by_mode": {"tur_exports": tr_x_modes, "isr_imports": il_m_modes},
            }
        )
        got = [k for k, v in (("TR-X", tr_x), ("TR-M", tr_m), ("IL-M", il_m)) if v is not None]
        print(f"  {period}: {', '.join(got) or 'no line on either side'}", flush=True)

    return {
        "about": (
            "Türkiye's declared halt of trade with Israel against both states' own monthly returns. "
            "Türkiye reports exports by country of destination and Israel reports imports by country "
            "of origin, so a gap between them measures routing through third countries, not smuggling: "
            "a Turkish-made good shipped via a third country is an export to that country in Türkiye's "
            "books and an import of Turkish origin in Israel's. Figures are US dollars. A month with no "
            "Israel line in Türkiye's returns is marked reported when Türkiye reported other partners "
            "that month, so an absent line is not read as a fall to zero unless the check passed."
        ),
        "source": {
            "name": "UN Comtrade — monthly merchandise trade, HS, all commodities",
            "url": "https://comtradeapi.un.org/public/v1/preview/C/M/HS",
            "terms": "https://comtrade.un.org/data/AboutDataUsage",
            "reporters": {"792": "Türkiye", "376": "Israel", "276": "Germany (control)"},
        },
        "policy": POLICY,
        "method": {
            "total_row": "motCode 0, customsCode C00",
            "modes": MODES,
            "window": [f"{FIRST_YEAR}{FIRST_MONTH:02d}", series[-1]["period"] if series else None],
        },
        "series": series,
        "routes": build_routes(cache, refresh),
        "chapters": build_chapters(cache, refresh),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--cache",
        default=os.environ.get("GT_TRADE_CACHE", Path(tempfile.gettempdir()) / "gt-trade-cache"),
    )
    ap.add_argument("--refresh", action="store_true", help="download again instead of using the cache")
    args = ap.parse_args()

    data = build(Path(args.cache), args.refresh)
    OUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    after = [s for s in data["series"] if s["period"] >= "202406"]
    still = [s for s in after if (s["isr_imports_from_tur"] or 0) > 0]
    print(
        f"{len(data['series'])} months -> {OUT.relative_to(ROOT)}; "
        f"{len(still)} of {len(after)} months after the halt still carry an Israeli import line",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
