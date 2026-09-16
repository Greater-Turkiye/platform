# Greater-Turkiye/platform

[Türkçe](#türkçe) · [English](#english)

Açık kaynak istihbarat (OSINT) topluluğunun kodu: yayındaki harita ve panel, harita veri üreticileri, sinyal toplayıcılar ve veritabanı şeması.
The code of the open-source intelligence community: the live map and dashboard, the map data builders, the signal collectors and the database schema.

**Yayında / Live:** <https://greater-turkiye.github.io/platform/>

---

## Türkçe

### Bu depo ne içerir?

| Bölüm | Durum | Açıklama |
|---|---|---|
| [`apps/web`](apps/web) | **Yayında** | Statik site: ana sayfadaki dünya küresi ve OSINT paneli. Derleme adımı yok; D3 ve topojson-client depoda barındırılır. Katman listesi: [apps/web/README.md](apps/web/README.md) |
| [`tools/geo`](tools/geo) | **Çalışıyor** | Harita katmanlarını resmî kaynaklardan yeniden üretilebilir şekilde kuran Python betikleri (Mavi Vatan, KKTC ruhsat sahaları, Marmara ve Boğazlar, temsilcilikler, harekât bölgeleri) |
| [`collectors`](collectors) | **Geliştiriliyor** | GitHub Actions üzerinde çalışan Python toplayıcılar: RSS alımı, normalleştirme, tekrar eleme (simhash), güvenlik süzgeci ve coğrafi çit |
| [`db`](db) | **Taslak** | Cloudflare D1 şeması ve migration'lar (`signals`, `ops`) |
| [`apps/api`](apps/api), [`apps/review-bot`](apps/review-bot), [`apps/scheduler`](apps/scheduler) | **Planlandı** | Cloudflare Worker'lar: alım ucu, Telegram inceleme botu, cron tetikleyici. Şimdilik yalnızca tasarım notları |
| [`publishers`](publishers) | **Planlandı** | Yayın kuyruğu tüketicisi (Telegram, Bluesky, RSS) |

Doğrulanmış kayıtlar bu depoda değil, [datasets](https://github.com/Greater-Turkiye/datasets) deposunda tutulur; panel onların yayımlanmış çıktısını okur.

### Değişmez kurallar

- **Hiçbir şey insan onayı olmadan yayımlanmaz.** Otomasyon ve dil modelleri yalnızca öneri üretir ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)).
- **Türk kuvvetlerinin konum ve hareketleri yayımlanmaz.** Resmî TSK varlığı yalnızca ülke düzeyinde gösterilir; resmî olarak ilan edilmiş harekât bölgeleri yalnızca bölgenin tamamı olarak çizilir ([kırmızı çizgiler](https://github.com/Greater-Turkiye/handbook/blob/main/tr/02-red-lines.md), [ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md), [ADR 0015](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0015-announced-operation-areas.md)).
- **Her harita katmanının kaynağı vardır.** Ülke rengi için imzalı anlaşma, deniz alanı için resmî koordinat veya açıkça "şematik" etiketi gerekir. Lisansı uygun olmayan üçüncü taraf verisi kopyalanmaz; kullanılan veri [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md) içinde künyelenir.
- **Sıfır bütçe.** Hiçbir hesapta ödeme yöntemi yoktur; ücretsiz sınırlar aşılamaz tavandır ([ADR 0008](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0008-zero-budget-infrastructure.md)).

### Siteyi yerelde çalıştırma

```bash
# platform/apps/web ile datasets/dist aynı kökten servis edilir
python -m http.server 8765
# http://127.0.0.1:8765/platform/          → ana sayfa
# http://127.0.0.1:8765/platform/panel.html → panel
```

Panel, veri kayıtlarını `/datasets/` altındaki JSONL dosyalarından okur; bunlar `datasets` deposunda `python tools/gt.py build` ile üretilir.

Yararlı parametreler: `?globe-t=<saniye>` küre animasyonunu belirli bir ana sarar, `?region=<kod>` paneli o bölgeye odaklar.

### Harita verisini yeniden üretme

```bash
cd tools/geo
python build_maritime.py          # Mavi Vatan: anlaşmalı alanlar, bildirilen hatlar, şematik alanlar
python build_kktc_licences.py     # KKTC A–G ruhsat sahaları + birleşik Türkiye + KKTC alanı
python build_marmara_straits.py   # Marmara Denizi ve Boğazlar
python build_operation_areas.py   # İlan edilmiş harekât bölgeleri
python build_missions.py          # Dış temsilcilikler
```

Betikler girdileri depo dışında önbelleğe alır ve çıktı dosyasını bayt bayt aynı üretir. Kaynak künyeleri `apps/web/assets/data/*-SOURCES.md` dosyalarındadır.

### Toplayıcılar

```bash
cd collectors
uv sync
uv run pytest          # birim testler
uv run gt-collect --help
```

Güvenlik süzgeci (`safety.py`) ve coğrafi çit (`geo.py`), veri diske yazılmadan önce çalışır.

### Yayın

`main` dalına giren her değişiklik [`.github/workflows/pages.yml`](.github/workflows/pages.yml) ile GitHub Pages'e yayımlanır. Değişiklikler dal + PR ile gelir; `main` korumalıdır.

### Katkı

Önce [katkı rehberi](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) ve [kırmızı çizgiler](https://github.com/Greater-Turkiye/handbook/blob/main/tr/02-red-lines.md). Mimari ve aşamalar: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md). Yapay zekâ aracıları için depo kuralları: [CLAUDE.md](CLAUDE.md).

### Lisans

Kod [MIT](LICENSE). Üretilen veriler `datasets` deposunda CC BY 4.0 ile yayımlanır. Üçüncü taraf veri ve yazı tiplerinin künyesi [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md) içindedir.

---

## English

### What is in this repository?

| Part | Status | Description |
|---|---|---|
| [`apps/web`](apps/web) | **Live** | The static site: the globe on the home page and the OSINT dashboard. No build step; D3 and topojson-client are vendored. Layer list: [apps/web/README.md](apps/web/README.md) |
| [`tools/geo`](tools/geo) | **Working** | Python builders that construct the map layers reproducibly from official sources (Blue Homeland, TRNC licence areas, the Sea of Marmara and the Straits, diplomatic missions, announced operation areas) |
| [`collectors`](collectors) | **In progress** | Python collectors that run in GitHub Actions: RSS ingest, normalisation, near-duplicate removal (simhash), the safety filter and the geofence |
| [`db`](db) | **Draft** | Cloudflare D1 schema and migrations (`signals`, `ops`) |
| [`apps/api`](apps/api), [`apps/review-bot`](apps/review-bot), [`apps/scheduler`](apps/scheduler) | **Planned** | Cloudflare Workers: the ingest endpoint, the Telegram review bot, the cron trigger. Design notes only for now |
| [`publishers`](publishers) | **Planned** | The publish-queue consumer (Telegram, Bluesky, RSS) |

Verified records do not live here; they live in the [datasets](https://github.com/Greater-Turkiye/datasets) repository, and the dashboard reads their published export.

### Non-negotiable rules

- **Nothing is published without human approval.** Automation and language models only make suggestions ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)).
- **Positions and movements of Turkish forces are never published.** Official Turkish presence is shown at country level only, and officially announced operation areas are drawn only as whole areas ([red lines](https://github.com/Greater-Turkiye/handbook/blob/main/en/02-red-lines.md), [ADR 0013](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0013-map-layers-turkiye-perspective.md), [ADR 0015](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0015-announced-operation-areas.md)).
- **Every map layer is sourced.** A country's colour needs a signed agreement; a maritime area needs official coordinates or an explicit "schematic" label. Third-party data with an unsuitable licence is never copied, and what we do use is credited in [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md).
- **Zero budget.** No account has a payment method, so free limits are hard caps ([ADR 0008](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0008-zero-budget-infrastructure.md)).

### Running the site locally

```bash
# serve platform/apps/web and datasets/dist from one root
python -m http.server 8765
# http://127.0.0.1:8765/platform/          → home
# http://127.0.0.1:8765/platform/panel.html → dashboard
```

The dashboard reads records from the JSONL files under `/datasets/`, produced in the `datasets` repository with `python tools/gt.py build`.

Useful parameters: `?globe-t=<seconds>` jumps the globe animation to a moment in its cycle, `?region=<code>` focuses the dashboard on a region.

### Rebuilding the map data

```bash
cd tools/geo
python build_maritime.py          # Blue Homeland: agreed areas, notified limits, schematic areas
python build_kktc_licences.py     # TRNC licence areas A–G + the merged Türkiye + TRNC area
python build_marmara_straits.py   # Sea of Marmara and the Turkish Straits
python build_operation_areas.py   # announced operation areas
python build_missions.py          # diplomatic missions
```

The builders cache their inputs outside the repository and reproduce the output byte for byte. Source notes live in `apps/web/assets/data/*-SOURCES.md`.

### Collectors

```bash
cd collectors
uv sync
uv run pytest          # unit tests
uv run gt-collect --help
```

The safety filter (`safety.py`) and the geofence (`geo.py`) run before anything is written to storage.

### Deployment

Every change that lands on `main` is published to GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Changes arrive by branch and pull request; `main` is protected.

### Contributing

Start with the [contributing guide](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) and the [red lines](https://github.com/Greater-Turkiye/handbook/blob/main/en/02-red-lines.md). Architecture and phases: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md). Repository rules for AI agents: [CLAUDE.md](CLAUDE.md).

### Licence

Code is [MIT](LICENSE). Data is published in the `datasets` repository under CC BY 4.0. Third-party data and fonts are credited in [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md).
