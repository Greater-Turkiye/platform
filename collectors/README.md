# collectors

[Türkçe](#türkçe) · [English](#english) · [İnceleme kuyruğu / Review queue](#i̇nceleme-kuyruğu--review-queue) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: RSS/Atom toplayıcı, güvenlik filtresi ve **günlük zamanlanmış çalışma** hazır; çalışma, BM akışlarından gelen adayları bir GitHub konusunda insan incelemesine sunar. Hiçbir akış ingest'e **gönderilmiyor** (henüz `api` Worker'ı ve `source_id` yok). / Status: the RSS/Atom collector, the safety filter and a **daily scheduled run** work; the run puts candidates from the UN feeds in front of a human in a GitHub issue. Nothing is **sent** to ingest yet (no `api` Worker, no `source_id`).
>
> Paket / Package: `gt_collectors` (`src/`), yapılandırma / config: [`config/feeds.yaml`](config/feeds.yaml), kaynaklar / sources: [`sources.md`](sources.md), iş akışı / workflow: [`.github/workflows/collect.yml`](../.github/workflows/collect.yml), durum / state: [`state/`](state/).

---

## Türkçe

Toplayıcılar açık kaynaklardan veri çeken, normalleştiren ve insan incelemesine sunan küçük Python programlarıdır. Bağımlılıklar `uv` ile yönetilir. Bugün çalışan yol GitHub Actions'taki günlük `collect` iş akışıdır (`schedule:` + `workflow_dispatch`); `api` Worker'ı ve `scheduler` Worker'ı devreye girince aynı toplayıcılar HMAC imzalı partileri ingest'e gönderecek.

Kurallar:

- Her toplayıcı yalnızca **herkese açık** kaynaklara, giriş yapmadan ve kaynağın kullanım koşullarına uyarak erişir. Kullanıcı hesabı, çerez hilesi veya ödeme duvarı aşma yok.
- Kaynağa saygılı davranılır: `ETag` / `If-Modified-Since`, makul bekleme süreleri, tanımlayıcı bir `User-Agent`.
- **Türk kuvvetleri güvenlik filtresi** ayrıştırmadan hemen sonra, bellekte ve diske veya ağa hiçbir şey yazılmadan önce çalışır. Atılan kayıtlar günlüğe yazılmaz; yalnızca atılan öğe **sayısı** raporlanır.
- Tam metin yeniden yayımlanmaz; sinyal yalnızca iç inceleme içindir ve 90 gün sonra silinir.
- **Hiçbir şey yayımlanmaz.** Kuyruğa giren her öğe *doğrulanmamış adaydır*; kararı insan verir ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)).

## English

Collectors are small Python programs that fetch data from public sources, normalize it and put it in front of a human. Dependencies are managed with `uv`. The path that works today is the daily `collect` workflow in GitHub Actions (`schedule:` plus `workflow_dispatch`); once the `api` and `scheduler` Workers exist, the same collectors will also send HMAC-signed batches to ingest.

Rules:

- Every collector accesses **public** sources only, without logging in and within the source's terms of use. No user accounts, cookie tricks or paywall circumvention.
- Be polite to sources: `ETag` / `If-Modified-Since`, sensible back-off, a descriptive `User-Agent`.
- The **Turkish-forces safety filter** runs right after parsing, in memory, before anything is written to disk or the network. Dropped records are never logged; only the **count** of dropped items is reported.
- Full text is never republished; signals are for internal review only and are deleted after 90 days.
- **Nothing is published.** Everything that reaches the queue is an *unverified candidate*; a human decides (ADR 0007).

---

## İnceleme kuyruğu / Review queue

[`.github/workflows/collect.yml`](../.github/workflows/collect.yml) her gün 05:23 UTC'de (ve elle `workflow_dispatch` ile) çalışır:

1. `queue: true` işaretli akışları çeker, ayrıştırır ve normalleştirir;
2. **güvenlik süzgeci ve coğrafi çit** bellekte, hiçbir şey yazılmadan önce çalışır;
3. simhash ile yakın kopyaları ve tekilleştirme defterindeki (`state/seen.jsonl`, `collector-state` dalı) öğeleri eler;
4. kalan adayları JSONL yapıtı olarak yükler ve `inceleme-kuyrugu` etiketli, tarihli **tek bir konu** açar (aynı gün ikinci çalışma aynı konuya yorum bırakır);
5. konu açıldıktan **sonra** defteri bot commit'iyle `collector-state` dalına iter — konu açılamazsa öğeler görülmemiş sayılır ve sonraki çalışmada yine sunulur.

Konudaki her satır: başlık, kaynak bağlantısı, varsa Wayback arşiv bağlantısı, bölge tahmini, akış kimliği ve tekilleştirme kimliği. Çalışma başına en çok 40 aday; gerisi bir sonraki çalışmaya kalır. Konunun başındaki uyarı, öğelerin **doğrulanmamış aday** olduğunu söyler.

`.github/workflows/collect.yml` runs every day at 05:23 UTC, and on demand through `workflow_dispatch`:

1. fetch, parse and normalize the feeds marked `queue: true`;
2. the **safety filter and the geofence** run in memory, before anything is written;
3. near-duplicates (simhash) and anything already in the dedup ledger (`state/seen.jsonl` on the `collector-state` branch) are dropped;
4. what is left is uploaded as a JSONL artifact and written into **one dated issue** labelled `inceleme-kuyrugu` (a second run on the same day comments on the same issue);
5. **after** the issue exists, the ledger is pushed to `collector-state` as a bot commit — if the issue could not be opened, the items stay unseen and the next run offers them again.

Each line carries the title, the source link, a Wayback archive link when one exists, the region guess, the feed id and the dedup id. At most 40 candidates per run; the rest wait for the next run. The banner at the top of the issue says that the items are **unverified candidates**.

Ne gerekmez / What it does not need: sır, hesap, ödeme yöntemi — hiçbiri. Yalnızca `GITHUB_TOKEN` (`contents: write` ile yalnızca `collector-state` dalı, `issues: write`). / No secrets, no accounts, no payment method: only `GITHUB_TOKEN`.

---

## Teknik başvuru / Technical reference

### Geliştirme / Development

Python ≥ 3.11. Standart bir `pyproject.toml` (hatchling); `uv` ya da `pip` ile çalışır. / A standard `pyproject.toml` that works with both `uv` and `pip`.

```bash
cd collectors
uv sync --extra dev            # veya / or: python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
ruff check . && ruff format --check .
pytest                          # ağ erişimi yok / no network access
python -m gt_collectors.tools.build_geofence --check

# Sinyalleri JSON satırları olarak yazdır, hiçbir şey gönderme (sır gerekmez)
# Print signals as JSON lines, send nothing (no secrets needed)
gt-collect --feed rss-aze-mod --dry-run
gt-collect --feed rss-aze-mod --dry-run --input saved-feed.xml   # çevrimdışı / offline

# İnceleme kuyruğunu yerelde üret (iş akışının yaptığının aynısı, konu açmadan)
# Build the review queue locally (what the workflow does, without opening an issue)
gt-collect --queue-dir queue --state state/seen.jsonl --max-items 40
```

İki ayrı kapı vardır ve biri diğerini gerektirmez: `enabled: true` + `source_id` → ingest'e gönderilebilir (`INGEST_URL`, `INGEST_HMAC_KEY` gerekir); `queue: true` + kayıtlı `terms` → insan inceleme kuyruğuna girebilir (sır gerekmez, hiçbir şey gönderilmez). / Two independent gates: `enabled: true` with a `source_id` means a feed may be **sent to ingest** (needs `INGEST_URL` and `INGEST_HMAC_KEY`); `queue: true` with its `terms` on record means it may enter the **human review queue** (no secrets, nothing is sent).

| Modül / Module | İçerik / Content |
|---|---|
| `signal.py` | `Signal`/`Geo` dataclass'ları, sözleşme doğrulaması / dataclasses, contract validation |
| `normalize.py` | URL normalleştirme (izleme parametreleri atılır), `content_hash` / URL normalization (tracking params stripped) |
| `simhash.py` | 64-bit SimHash (yakın kopya) / near-duplicates |
| `safety.py`, `geo.py`, `data/tr_geofence.json` | Güvenlik filtresi ve geofence / safety filter and geofence |
| `ingest.py` | HMAC-SHA256 imzalı ≤100'lük partiler / signed batches of ≤100 |
| `fetch.py` | `urllib` tabanlı küçük HTTP yardımcısı (zaman aşımı, UA, koşullu GET, yeniden deneme) / small HTTP helper |
| `state.py` | Tekilleştirme defteri (`{id, simhash, seen}`, budamalı) / dedup ledger, pruned |
| `review.py` | İnceleme kuyruğu: aday modeli, konu metni, Wayback araması, `redline_check` işareti / review queue: candidate model, issue body, Wayback lookup, `redline_check` marker |
| `rss.py`, `config.py`, `cli.py` | RSS/Atom toplayıcı, YAML yapılandırma, `gt-collect` / collector, config, CLI |

Bağımlılıklar / Dependencies: yalnızca / only `PyYAML` at runtime. We use `urllib` rather than `httpx` and `xml.etree` rather than `feedparser`: the few features we need are small to write, and every extra package is supply-chain surface in a job that holds the ingest HMAC key (ADR 0011). XML entity declarations are rejected, so entity-expansion attacks cannot work.

### Girdi yapılandırması / Input configuration

Tüm RSS akışları tek dosyada: [`config/feeds.yaml`](config/feeds.yaml). Bilinmeyen anahtarlar hata verir. / All RSS feeds live in one file; unknown keys are errors:

```yaml
feeds:
  - id: rss-example-mod          # benzersiz / unique
    kind: rss                     # şimdilik yalnızca rss / only rss for now (gdelt | firms | adsb | ais | … planned)
    name: Example Ministry of Defence
    country: XXX                  # ISO 3166-1 alpha-3
    source_id: null               # datasets kaynak kaydı; göndermek için zorunlu / required to send
    url: https://example.org/feed.xml
    cadence_minutes: 30           # >= 15
    lang: en
    regions: [aegean]             # datasets vocab/regions.yaml
    enabled: false                # ingest kapısı / ingest gate: needs a source_id too
    queue: false                  # inceleme kuyruğu kapısı / review-queue gate: needs `terms`
    secrets: []                   # ör. / e.g. [FIRMS_MAP_KEY]
    terms: https://example.org/terms
    notes: …
```

### Çıktı: normalleştirilmiş sinyal / Output: normalized signal

```json
{
  "source_id": "src_...",
  "url": "https://example.org/news/123",
  "fetched_at": "2026-09-12T10:15:00Z",
  "published_at": "2026-09-12T09:58:00Z",
  "lang": "en",
  "title": "…",
  "text": "…",
  "geo": { "region": "aegean", "place": "…", "lat": null, "lon": null, "precision": "region" },
  "raw_hash": "sha256:…"
}
```

| Alan / Field | Açıklama / Description |
|---|---|
| `source_id` | `datasets` kaynak kaydı kimliği / source record ID in `datasets` |
| `url` | Öğenin kalıcı bağlantısı / canonical URL of the item |
| `fetched_at` | Çekilme zamanı, UTC, ISO 8601 / fetch time |
| `published_at` | Kaynağın bildirdiği yayın zamanı (UTC), bilinmiyorsa `null` / publication time reported by the source, or `null` |
| `lang` | BCP 47 dil kodu / language code |
| `title`, `text` | Başlık ve kısaltılmış metin (tam kopya değil) / title and truncated text (not a full copy) |
| `geo` | Konum ipucu: bölge kodu, yer adı, isteğe bağlı koordinat ve kesinlik / location hint |
| `raw_hash` | Çekilen ham baytların SHA-256'sı / SHA-256 of the raw fetched bytes |

Ingest bu alanlardan ayrıca `content_hash` (normalleştirilmiş URL + metin, SHA-256) üretir; tekilleştirme bununla yapılır. Partiler en fazla 100 sinyaldir ve HMAC ile imzalanır ([apps/api/README.md](../apps/api/README.md)).
Ingest additionally derives `content_hash` (SHA-256 of normalized URL + text) and deduplicates on it. Batches hold at most 100 signals and are HMAC-signed.

Uygulama notları / Implementation notes:

- `url` is stored **already normalized**: tracking parameters are removed before anything is stored.
- `source_id` may be `null` only while a source awaits registry (dry-run only); `send` refuses it.
- `raw_hash` for RSS is the SHA-256 of the item element's XML serialization.
- `text` is an excerpt of at most 500 characters; the model rejects more than 1000.
- `content_hash` = `"sha256:" + hex(SHA-256(UTF-8(normalize_url(url) + "\n" + normalize_text(text))))`. The exact rules are in the `normalize.py` docstring; they are written so a JavaScript port (ingest Worker) gives identical bytes: raw query parts are sorted without re-encoding, the whitespace class is explicit, Unicode is NFC.
- Ingest batch envelope (`gt-ingest/1`): `{"schema", "collector_id", "sent_at", "signals": [ {…contract…, "content_hash", "simhash"} ]}`. `simhash` is a 16-character hex string (JSON numbers cannot carry 64-bit integers into JS); the Worker should recompute `content_hash` and reject a mismatch.

### Planlanan toplayıcılar / Planned collectors

Tüm koşullar kullanımdan önce teyit edilecektir. / All terms must be confirmed before use.

| Toplayıcı / Collector | Kaynak / Source | Lisans ve koşul notları / Licence and terms notes |
|---|---|---|
| `rss` | Resmî bakanlık/hükümet RSS ve basın sayfaları / Official MoD/government RSS and press pages | Siteye göre değişir; yalnızca bağlantı + kısa özet saklanır / Varies per site; store link + short excerpt only |
| `gdelt` | GDELT | Açık erişim, atıf gerekir; gürültülü, yalnızca ipucu / Open access, attribution required; noisy, hints only |
| `firms` | NASA FIRMS (VIIRS/MODIS aktif yangın) | Ücretsiz MAP_KEY; NASA verisi, atıf / Free MAP_KEY; NASA data, cite |
| `adsb` | adsb.lol / OpenSky | adsb.lol veritabanı lisansı (atıf, benzer paylaşım); OpenSky ticari olmayan/araştırma koşulları / adsb.lol database licence (attribution, share-alike); OpenSky non-commercial/research terms |
| `ais` | aisstream.io | Ücretsiz API anahtarı; WebSocket, süre sınırlı dinleme / Free API key; WebSocket, time-boxed listening |
| `sentinel` | Copernicus Data Space (Sentinel-1/2) | Ücretsiz hesap; Copernicus verisi atıfla açık; yalnızca sahne keşfi ve meta veri / Free account; Copernicus data open with attribution; scene discovery and metadata only |
| `telegram-web` | Herkese açık kanallar, `t.me/s/<kanal>` / Public channels via `t.me/s/<channel>` | Hesap yok, giriş yok, kapalı grup yok; Telegram koşulları / No account, no login, no private groups; Telegram terms |
| `archive` | Wayback Machine SPN2 | Ücretsiz anahtar; hız sınırlı / Free keys; rate-limited |

### Türk kuvvetleri güvenlik filtresi / Turkish-forces safety filter

Kural (her toplayıcıda ve ingest'te yeniden) / Rule (in every collector, and again at ingest):

```text
DROP if record.kind == adsb and 0x4B8000 <= icao24 <= 0x4BFFFF      # Türkiye ICAO 24-bit bloğu / block
DROP if record.kind == ais  and mid(mmsi) == 271                     # Türkiye MID
DROP if record has a position and point_in(position, TR_GEOFENCE)    # Türkiye geofence
```

- `mid(mmsi)` tüm MMSI biçimlerini çözmelidir: gemiler (`MIDxxxxxx`), kıyı istasyonları (`00MIDxxxx`), grup çağrıları (`0MIDxxxxx`), SAR hava araçları (`111MIDxxx`), seyir yardımcıları (`99MIDxxxx`) vb. / `mid(mmsi)` must handle all MMSI formats: ships, coast stations, group calls, SAR aircraft, aids to navigation, etc.
- `TR_GEOFENCE`: Türkiye kara alanı + karasuları + tampon bölge; dosya ve tampon mesafesi bir ADR ile belirlenir. / Türkiye land area + territorial waters + a buffer; the file and buffer distance are set by an ADR.
- Kod yoksa, geçersizse veya konum belirsizse **güvenli tarafta kal**: at. / If a code is missing, invalid or the position ambiguous, **fail safe**: drop.
- Filtre testleri CI'de zorunludur ve yalnızca sentetik veriyle yazılır. / Filter tests are mandatory in CI and use synthetic data only.

**Uygulama / Implementation** (`src/gt_collectors/safety.py`, `geo.py`):

- MMSI: the formats above plus `8MIDxxxxx` (handheld) and `98MIDxxxx` (craft associated with a parent ship). `970/972/974…` (SART/MOB/EPIRB) carry no MID and are dropped, as is anything not exactly nine digits or with a MID outside 201–775. Integer MMSIs are zero-padded.
- ICAO: exactly 24 bits (`"4b8000"`, `"0x4B8000"` or an int). Non-ICAO addresses such as `~abc123` are dropped. So are ADS-B and AIS records **without a position**, and any half-present, non-numeric, non-finite or out-of-range coordinate.
- Geofence data: `data/tr_geofence.json`, built by `python -m gt_collectors.tools.build_geofence` from the Natural Earth 1:50m data already vendored at `apps/web/assets/data/countries-50m.json` (feature `792`, public domain). Douglas–Peucker simplification with the maximum deviation recorded. A hand-drawn internal-waters polygon covers the Sea of Marmara, the Bosphorus and the Dardanelles, which Natural Earth leaves open between Thrace and Anatolia. CI checks the vendored file is byte-for-byte reproducible.
- Test: inside a polygon (even-odd ray casting) **or** within `12 nm + simplification error + 2 km source margin`, plus 1 % for the distance approximation (≈ 25 km in total) of any edge. Dependency-free; bounding-box fast path.
- Only drop **counts** (by reason) are returned. Dropped records are never logged or returned.

**Açık sorular (ADR için) / Open questions for the geofence ADR:**

1. The buffer is uniform. At land borders it also drops points up to ~25 km inside neighbours (e.g. Batumi), and in the Aegean it covers much of the eastern Greek islands (e.g. Kastellorizo/Meis). This is fail-safe, but it hides legitimate signals. Options: a coastal-only buffer, 6 nm in the Aegean, or a smaller land-border margin.
2. Northern Cyprus (TRNC) and Turkish forces deployed abroad (Syria, Iraq, Qatar, Libya, Somalia, Azerbaijan…) are **not** in the geofence; only the identifier rules cover them. Should N. Cyprus (Natural Earth has it as a separate feature) be added?
3. Natural Earth 1:50m omits small islands (Bozcaada, the Marmara islands…). The mainland buffer covers them, but not their full territorial sea.
- Metin içeriği için: Türk kuvvetlerinin konum veya hareketinden söz eden öğeler triyajda `redline_check` ile işaretlenir ve asla otomatik olarak bülten önerisine dönüşmez. / For text: items mentioning Turkish forces positions or movements are flagged `redline_check` in triage and never auto-suggested as bulletins.
