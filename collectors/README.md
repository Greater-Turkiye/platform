# collectors

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: çatı, güvenlik filtresi ve RSS/Atom toplayıcı hazır; hiçbir akış henüz açık değil. / Status: framework, safety filter and RSS/Atom collector in place; no feed is enabled yet.
>
> Paket / Package: `gt_collectors` (`src/`), yapılandırma / config: [`config/feeds.yaml`](config/feeds.yaml), kaynaklar / sources: [`sources.md`](sources.md).

---

## Türkçe

Toplayıcılar açık kaynaklardan veri çeken, normalleştiren ve `api` Worker'ına gönderen küçük Python programlarıdır. Bağımlılıklar `uv` ile yönetilir, her toplayıcı GitHub Actions'ta `scheduler` Worker'ının `workflow_dispatch` çağrısıyla çalışır (en sık 15 dakikada bir).

Kurallar:

- Her toplayıcı yalnızca **herkese açık** kaynaklara, giriş yapmadan ve kaynağın kullanım koşullarına uyarak erişir. Kullanıcı hesabı, çerez hilesi veya ödeme duvarı aşma yok.
- Kaynağa saygılı davranılır: `ETag` / `If-Modified-Since`, makul bekleme süreleri, tanımlayıcı bir `User-Agent`.
- **Türk kuvvetleri güvenlik filtresi** ayrıştırmadan hemen sonra, bellekte ve diske veya ağa hiçbir şey yazılmadan önce çalışır. Atılan kayıtlar günlüğe yazılmaz; yalnızca atılan öğe **sayısı** raporlanır.
- Tam metin yeniden yayımlanmaz; sinyal yalnızca iç inceleme içindir ve 90 gün sonra silinir.

## English

Collectors are small Python programs that fetch data from public sources, normalize it and post it to the `api` Worker. Dependencies are managed with `uv`; each collector runs in GitHub Actions when the `scheduler` Worker calls `workflow_dispatch` (at most every 15 minutes).

Rules:

- Every collector accesses **public** sources only, without logging in and within the source's terms of use. No user accounts, cookie tricks or paywall circumvention.
- Be polite to sources: `ETag` / `If-Modified-Since`, sensible back-off, a descriptive `User-Agent`.
- The **Turkish-forces safety filter** runs right after parsing, in memory, before anything is written to disk or the network. Dropped records are never logged; only the **count** of dropped items is reported.
- Full text is never republished; signals are for internal review only and are deleted after 90 days.

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
```

Gerçek çalıştırma yalnızca `enabled: true` ve `source_id` dolu akışları, `INGEST_URL` ve `INGEST_HMAC_KEY` ortam değişkenleriyle gönderir. / A real run sends only `enabled: true` feeds that have a `source_id`, using the `INGEST_URL` and `INGEST_HMAC_KEY` environment variables.

| Modül / Module | İçerik / Content |
|---|---|
| `signal.py` | `Signal`/`Geo` dataclass'ları, sözleşme doğrulaması / dataclasses, contract validation |
| `normalize.py` | URL normalleştirme (izleme parametreleri atılır), `content_hash` / URL normalization (tracking params stripped) |
| `simhash.py` | 64-bit SimHash (yakın kopya) / near-duplicates |
| `safety.py`, `geo.py`, `data/tr_geofence.json` | Güvenlik filtresi ve geofence / safety filter and geofence |
| `ingest.py` | HMAC-SHA256 imzalı ≤100'lük partiler / signed batches of ≤100 |
| `fetch.py` | `urllib` tabanlı küçük HTTP yardımcısı (zaman aşımı, UA, koşullu GET, yeniden deneme) / small HTTP helper |
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
    enabled: false                # koşullar teyit edilene kadar / until terms are confirmed
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
