# collectors

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım. Henüz kod yok. / Status: design. No code yet.

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

### Girdi yapılandırması / Input configuration

Toplayıcı örneği başına bir YAML dosyası (`collectors/config/<id>.yaml`, planlanan) / One YAML file per collector instance (planned):

```yaml
id: rss-example-mod          # benzersiz / unique
kind: rss                     # rss | gdelt | firms | adsb | ais | sentinel | telegram-web
source_id: src_...            # datasets deposundaki kaynak kaydı / source record in datasets
url: https://example.org/feed.xml
cadence_minutes: 30           # >= 15
lang: en
regions: [aegean]
enabled: false                # koşullar teyit edilene kadar / until terms are confirmed
secrets: []                   # ör. / e.g. [FIRMS_MAP_KEY]
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
- `TR_GEOFENCE`: Türkiye kara alanı + karasuları + tampon bölge; dosya ve tampon mesafesi bir ADR ile belirlenir (`collectors/geo/`, planlanan). / Türkiye land area + territorial waters + a buffer; the file and buffer distance are set by an ADR (planned under `collectors/geo/`).
- Kod yoksa, geçersizse veya konum belirsizse **güvenli tarafta kal**: at. / If a code is missing, invalid or the position ambiguous, **fail safe**: drop.
- Filtre testleri CI'de zorunludur ve yalnızca sentetik veriyle yazılır. / Filter tests are mandatory in CI and use synthetic data only.
- Metin içeriği için: Türk kuvvetlerinin konum veya hareketinden söz eden öğeler triyajda `redline_check` ile işaretlenir ve asla otomatik olarak bülten önerisine dönüşmez. / For text: items mentioning Turkish forces positions or movements are flagged `redline_check` in triage and never auto-suggested as bulletins.
