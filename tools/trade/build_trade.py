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
import datetime as dt
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
# Filled once per run by `resolve_windows`, from the halt and from the last month each reporter
# has actually published. They are module-level because every section compares the same two.
WINDOW_BEFORE: list[str] = []
WINDOW_AFTER: list[str] = []
CHAPTER_BEFORE: list[str] = []
CHAPTER_AFTER: list[str] = []


# The halt was announced in May 2024, so the twelve months before it are a fact about history and
# do not move. What comes after does: each month the UN publishes adds a month that should be in
# the comparison, and the oldest should drop out of it.
HALT_PERIOD = "202405"
WINDOW_MONTHS = 12


def shift(period: str, months_back: int) -> str:
    """The period `months_back` months before `period`, as YYYYMM."""
    y, m = int(period[:4]), int(period[4:])
    total = y * 12 + (m - 1) - months_back
    return f"{total // 12}{total % 12 + 1:02d}"


def window_ending(last: str, n: int = WINDOW_MONTHS) -> list[str]:
    """The n periods ending at `last`, oldest first."""
    return [shift(last, i) for i in range(n - 1, -1, -1)]


def latest_reported(reporter: int, partner: int, flow: str, cache: Path, refresh: bool) -> str | None:
    """The most recent month for which this reporter actually published a figure.

    The UN publishes with a lag that is not the same for every reporter, so the end of the window
    is asked of the data rather than assumed from the calendar. It walks back from last month and
    stops at the first month with a line; a run of empty months at the end means the reporter is
    simply behind, not that trade stopped, which is why nothing here reads an absence as a zero.
    """
    today = dt.datetime.now(tz=dt.UTC)
    cursor = f"{today.year}{today.month:02d}"
    for _ in range(24):  # a reporter can be a year behind; walk far enough to find it
        cursor = shift(cursor, 1)
        if cursor <= HALT_PERIOD:
            return None
        total, _ = total_and_modes(fetch(cursor, reporter, partner, flow, cache, refresh))
        if total is not None:
            return cursor
    return None


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


# Which chapters are worth opening one level further. A chapter is a wide category: "iron and
# steel" covers rebar for a building site and coated sheet for a factory, and those are different
# answers to the question this page asks. Kept to a short list because each chapter costs a full
# pass over both windows, and a breakdown nobody reads is a download nobody needed.
HEADING_CHAPTERS = ("72", "73", "68", "25")

# The tariff's own wording for the headings this series actually carries, shortened to a row. The
# English comes from the UN reference; anything missing falls back to the code itself.
HEADING_TR = {
    "7213": "Sıcak haddelenmiş filmaşin (inşaat demiri girdisi)",
    "7214": "İnşaat demiri — sıcak haddelenmiş çubuk",
    "7215": "Diğer demir/çelik çubuklar",
    "7216": "Profiller (köşebent, U, I, H)",
    "7208": "Sıcak haddelenmiş yassı ürün (kaplamasız)",
    "7209": "Soğuk haddelenmiş yassı ürün",
    "7210": "Kaplanmış yassı ürün (galvaniz, boyalı)",
    "7211": "Dar yassı ürün, sıcak/soğuk",
    "7212": "Dar yassı ürün, kaplanmış",
    "7217": "Demir/çelik teller",
    "7219": "Paslanmaz yassı ürün",
    "7225": "Alaşımlı yassı ürün",
    "7227": "Alaşımlı filmaşin",
    "7228": "Alaşımlı çubuk ve profil",
    "7301": "Palplanş ve kaynaklı profil",
    "7304": "Dikişsiz boru",
    "7305": "Büyük çaplı boru",
    "7306": "Diğer borular ve profiller",
    "7308": "Çelik konstrüksiyon (köprü, kule, kapı, çatı)",
    "7310": "Çelik varil, bidon, kutu",
    "7312": "Çelik halat ve tel örgü",
    "7318": "Cıvata, somun, vida",
    "7326": "Diğer demir/çelik eşya",
    "6810": "Çimentodan, betondan mamul eşya (blok, boru, direk)",
    "6802": "İşlenmiş yapı taşı (mermer, granit)",
    "6807": "Asfalt esaslı eşya (su yalıtımı)",
    "6809": "Alçıdan eşya (alçıpan)",
    "2523": "Çimento (portland, klinker dahil)",
    "7202": "Ferro alaşımlar",
    "7220": "Paslanmaz dar yassı ürün",
    "7222": "Paslanmaz çubuk ve profil",
    "7223": "Paslanmaz tel",
    "7226": "Alaşımlı dar yassı ürün",
    "7307": "Boru bağlantı parçaları (dirsek, manşon)",
    "7309": "Büyük depo, tank ve sarnıç",
    "7311": "Basınçlı gaz tüpleri",
    "7313": "Dikenli tel",
    "7314": "Tel örgü, hasır, kafes",
    "7315": "Zincir ve aksamı",
    "7317": "Çivi, raptiye, zımba teli",
    "7319": "Dikiş iğnesi, tığ ve benzeri",
    "7320": "Yaylar ve yaprak yaylar",
    "7321": "Soba, ocak, ızgara ve benzeri",
    "7322": "Kalorifer radyatörü",
    "7323": "Sofra ve mutfak eşyası",
    "7324": "Sıhhi tesisat eşyası",
    "7325": "Dökme demir/çelik eşya",
    "2506": "Kuvars ve kuvarsit",
    "2508": "Killer (kaolin dışı)",
    "2511": "Barit ve viterit",
    "2513": "Ponza, zımpara, doğal aşındırıcılar",
    "2518": "Dolomit",
    "2520": "Alçı taşı, anhidrit ve alçılar",
    "2522": "Sönmemiş ve sönmüş kireç",
    "2526": "Steatit (talk taşı)",
    "2529": "Feldispat, flüorit",
    "2530": "Tasnif dışı mineral maddeler",
    "6801": "Doğal taştan parke, bordür, döşeme",
    "6804": "Değirmen taşı, bileği taşı, zımpara diski",
    "6805": "Aşındırıcı toz ve tanecikler (mesnetli)",
    "6806": "Cüruf yünü, taş yünü, genleştirilmiş kil",
    "6808": "Bitkisel lifli panel ve levhalar",
    "6811": "Lif-çimento eşya",
    "6813": "Sürtünme malzemesi (balata, fren)",
    "6815": "Taş ve mineral maddelerden diğer eşya",
    "2517": "Mıcır, çakıl, balast",
    "2515": "Mermer ve traverten, blok hâlinde",
    "2516": "Granit, bazalt, blok hâlinde",
}


def heading_names(cache: Path, refresh: bool) -> dict[str, str]:
    """The UN's own text for each four-digit heading, cached with the rest of the downloads."""
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / "hs-headings.json"
    if not path.exists() or refresh:
        req = urllib.request.Request(CHAPTERS_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    rows = json.loads(path.read_text(encoding="utf-8")).get("results", [])
    out = {}
    for row in rows:
        code = str(row.get("id") or "")
        if len(code) != 4 or not code.isdigit():
            continue
        out[code] = str(row.get("text") or "").split(" - ", 1)[-1].strip()
    return out


def headings_of(rows: list[dict]) -> dict[str, float]:
    """The undivided figure for each four-digit heading in one month's reply."""
    out: dict[str, float] = {}
    for r in rows:
        if str(r.get("customsCode") or "C00") != "C00":
            continue
        if str(r.get("partner2Code") or "0") != "0":
            continue
        if str(r.get("motCode")) != "0":
            continue
        code = str(r.get("cmdCode") or "")
        if len(code) != 4 or not code.isdigit():
            continue
        value = r.get("primaryValue")
        if value is not None:
            out[code] = out.get(code, 0.0) + float(value)
    return out


def build_headings(cache: Path, refresh: bool) -> dict:
    """The chapters that carry the weight, opened to four digits, on the same two windows."""
    names = heading_names(cache, refresh)
    windows = {"before": CHAPTER_BEFORE, "after": CHAPTER_AFTER}
    totals: dict[str, dict[str, float]] = {}
    seen: dict[str, set[str]] = {}
    months = {"before": 0, "after": 0}
    for label, window in windows.items():
        for period in window:
            rows = fetch(period, ISR, TUR, "M", cache, refresh, cmd="AG4")
            month = headings_of(rows)
            if not month:
                continue
            months[label] += 1
            for code, value in month.items():
                if code[:2] not in HEADING_CHAPTERS:
                    continue
                totals.setdefault(code, {"before": 0.0, "after": 0.0})[label] += value
                if label == "after" and value > 0:
                    seen.setdefault(code, set()).add(period)

    out = []
    for code, sums in totals.items():
        before = sums["before"] / months["before"] if months["before"] else None
        after = sums["after"] / months["after"] if months["after"] else None
        present = len(seen.get(code, ()))
        out.append({
            "heading": code,
            "chapter": code[:2],
            "name": names.get(code, code),
            "name_tr": HEADING_TR.get(code, names.get(code, code)),
            "before": round(before) if before else 0,
            "after": round(after) if after else 0,
            "change_pct": round(100 * (after - before) / before, 1) if (before and after is not None) else None,
            "months_present": present,
            # the same guard the chapters carry: one delivery averaged over a window is not a flow
            "lumpy": bool(after and present and present <= max(2, months["after"] // 4)),
        })
    out.sort(key=lambda h: -h["after"])
    return {
        "about": (
            "The chapters that carry most of what still arrives, opened from two digits to four. "
            "A chapter is a wide category: 'iron and steel' covers rebar for a building site and "
            "coated sheet for a factory, and those answer different questions. Both windows are "
            "read from Israel's own returns, as the chapters are, so the two are comparable. The "
            "figures say what arrived, never by which route or on whose ship."
        ),
        "chapters_opened": list(HEADING_CHAPTERS),
        "windows": {"before": [CHAPTER_BEFORE[0], CHAPTER_BEFORE[-1]],
                    "after": [CHAPTER_AFTER[0], CHAPTER_AFTER[-1]]},
        "months_with_data": months,
        "reporter": "Israel (376), imports from Türkiye (792)",
        "headings": out,
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


def resolve_windows(cache: Path, refresh: bool) -> dict:
    """Work out the two comparison windows for this run, and say so in the output.

    `routes` reads Türkiye's own exports and `chapters`/`headings` read Israel's imports, and the
    two reporters publish at different times, so each gets a window ending where its own data ends.
    Both "before" windows are the same fixed twelve months ending at the halt.
    """
    global WINDOW_BEFORE, WINDOW_AFTER, CHAPTER_BEFORE, CHAPTER_AFTER
    before = window_ending(shift(HALT_PERIOD, 1))
    tur_last = latest_reported(TUR, DEU, "X", cache, refresh)
    isr_last = latest_reported(ISR, TUR, "M", cache, refresh)
    WINDOW_BEFORE = before
    CHAPTER_BEFORE = before
    WINDOW_AFTER = window_ending(tur_last) if tur_last else []
    CHAPTER_AFTER = window_ending(isr_last) if isr_last else []
    return {
        "halt": HALT_PERIOD,
        "months": WINDOW_MONTHS,
        "before": [before[0], before[-1]],
        "routes_after": [WINDOW_AFTER[0], WINDOW_AFTER[-1]] if WINDOW_AFTER else None,
        "goods_after": [CHAPTER_AFTER[0], CHAPTER_AFTER[-1]] if CHAPTER_AFTER else None,
        "note": (
            "The window after the halt ends at the last month each reporter has published, asked "
            "of the data rather than taken from the calendar, because the UN's publishing lag is "
            "not the same for every reporter."
        ),
    }


def build(cache: Path, refresh: bool) -> dict:
    windows = resolve_windows(cache, refresh)
    print(f"  windows: before {windows['before']}, routes after {windows['routes_after']}, "
          f"goods after {windows['goods_after']}", flush=True)
    series = []
    for period in months(FIRST_YEAR, FIRST_MONTH):
        tr_x, tr_x_modes = total_and_modes(fetch(period, TUR, ISR, "X", cache, refresh))
        tr_m, _ = total_and_modes(fetch(period, TUR, ISR, "M", cache, refresh))
        il_m, il_m_modes = total_and_modes(fetch(period, ISR, TUR, "M", cache, refresh))
        # Absence is only a reported absence when the same month carries other partners.
        #
        # This used to read `control is not None and control > 0 if control is not None else True`,
        # which returns True when the control itself is missing — that is, it called a month in
        # which Türkiye published nothing at all a month in which Türkiye reported. Every month of
        # 2026 was marked as a reported absence on the strength of it, and the page said so. A
        # missing control is the one case where the answer has to be no.
        control = None
        if tr_x is None and tr_m is None:
            control, _ = total_and_modes(fetch(period, TUR, DEU, "X", cache, refresh))
        reported = True if (tr_x is not None or tr_m is not None) else bool(control and control > 0)
        series.append(
            {
                "period": period,
                "tur_exports_to_isr": tr_x,
                "tur_imports_from_isr": tr_m,
                "isr_imports_from_tur": il_m,
                "tur_reported_that_month": reported,
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
        "windows": windows,
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
        "headings": build_headings(cache, refresh),
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
