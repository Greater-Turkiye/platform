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
| [`apps/web`](apps/web) | **Yayında** | Statik site: ana sayfadaki dünya küresi, OSINT paneli ve yöntem sayfası. Derleme adımı yok; D3 ve topojson-client depoda barındırılır. Katman listesi: [apps/web/README.md](apps/web/README.md) |
| [`tools/geo`](tools/geo) | **Çalışıyor** | Harita katmanlarını resmî kaynaklardan yeniden üretilebilir şekilde kuran Python betikleri (Mavi Vatan, KKTC ruhsat sahaları, Marmara ve Boğazlar, temsilcilikler, harekât bölgeleri) |
| [`collectors`](collectors) | **Çalışıyor** | GitHub Actions'ta **her gün çalışan** Python toplayıcılar: RSS alımı, normalleştirme, tekrar eleme (simhash), güvenlik süzgeci ve coğrafi çit, ardından izleme bölgelerine ve olay türlerine göre **ilgi süzgeci**. Kalan adaylar `inceleme-kuyrugu` etiketli bir konuda insan incelemesine sunulur ([collect.yml](.github/workflows/collect.yml)) ve çalışmanın tamamı `gt-signals` D1 veritabanına yazılır; ingest'e gönderim `api` Worker'ı gelene kadar kapalı |
| [`db`](db) | **Kurulu** | Cloudflare D1 şeması ve migration'lar (`signals`, `ops`); iki veritabanı oluşturuldu, `signals` migration'ları uygulandı ve günlük toplama artık oraya yazıyor; `ops` henüz boş, hiçbir Worker bağlı değil |
| [`apps/scheduler`](apps/scheduler) | **Devam ediyor** | Cron tetikleyicisiyle çalışan, `collect.yml` iş akışını `workflow_dispatch` ile başlatan Cloudflare Worker'ı: kod ve testleri hazır ([scheduler-ci](.github/workflows/scheduler-ci.yml)), **henüz dağıtılmadı**. Toplayıcı tetikleyicisi, Worker dağıtılıp [ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md)'yı geçersiz kılan bir karar yazılana kadar `schedule:` üzerinde kalır |
| [`apps/api`](apps/api), [`apps/review-bot`](apps/review-bot) | **Planlandı** | Cloudflare Worker'lar: alım ucu ve Telegram inceleme botu. Şimdilik yalnızca tasarım notları |
| [`publishers`](publishers) | **Taslak** | Yayın kanallarının tasarımı ve **çalışan ama hiçbir şey göndermeyen** iskeleti (Telegram, Bluesky, RSS rölesi): mesaj sözleşmesi, içerik denetimleri, hız sınırları, insan onayı kapısı. Ağ istemcisi yok, kimlik bilgisi yok, açık kanal yok. Kamu akışı ise `datasets` deposunda üretilir |

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
# http://127.0.0.1:8765/platform/            → ana sayfa
# http://127.0.0.1:8765/platform/panel.html   → panel
# http://127.0.0.1:8765/platform/method.html  → yöntem
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

# İnceleme kuyruğunu yerelde üret: aday listesi + konu metni, hiçbir şey gönderilmez
uv run gt-collect --queue-dir queue --state state/seen.jsonl

# Aynı çalışmayı `gt-signals` D1 veritabanına yaz (SQL'i görmek için --d1-dry-run)
uv run gt-collect --write-d1 queue --d1-dry-run
```

Güvenlik süzgeci (`safety.py`) ve coğrafi çit (`geo.py`), veri diske yazılmadan önce çalışır.

Sonra **ilgi süzgeci** (`relevance.py`) gelir: her adaya bir izleme bölgesi sinyali (ülke ve yer adları, TR + EN) ile bir konu sinyali (askerî faaliyet, tatbikat, tedarik, hava sahası, deniz olayı, üs anlaşması, yaptırım) verir ve ikisini `0.5 × bölge + 0.5 × konu` olarak birleştirir; iki sinyalden biri sıfırsa puan sıfırdır. Eşik **0.5**; 0.40–0.50 arası satırlar ❓ `sınırda` işaretiyle yine kuyruğa girer. Eşiğin altındakiler **silinmez**: çalışma yapıtında `status: off-topic` olarak kalır, konudaki sayaç tablosunda görünür ve tekilleştirme defterine yazılmaz. Bölge ve anahtar sözcük tabloları koddan ayrıdır ([`collectors/src/gt_collectors/data/relevance.yaml`](collectors/src/gt_collectors/data/relevance.yaml)); nasıl genişletileceği [collectors/README.md](collectors/README.md#i̇lgi-süzgeci--relevance-filter) içindedir. Bu süzgeç yalnızca gürültü içindir: güvenlik süzgecinin yerine geçmez, onu zayıflatamaz.

[`.github/workflows/collect.yml`](.github/workflows/collect.yml) her gün 05:23 UTC'de (ve elle tetiklenerek) çalışır: koşulları kayda geçmiş akışları toplar, güvenlik süzgecinden geçirir, tekrarları eler, ilgi süzgecini uygular ve kalan adayları tarihli tek bir konuya yazar. Konudaki hiçbir öğe doğrulanmış değildir; kararı insan verir. Tekilleştirme defteri `collector-state` dalında tutulur ([collectors/state](collectors/state)).

Konu açıldıktan sonra son bir adım, çalışmanın **tamamını** — kuyruğa girenleri, sonraki çalışmaya kalanları ve konu dışı bulunanları — kendi triyaj durumlarıyla `gt-signals` D1 veritabanına yazar ([db/README.md](db/README.md)): konu insanın gördüğü liste, veritabanı ise geçmiştir. Yazma `INSERT … ON CONFLICT(content_hash) DO NOTHING` olduğu için aynı parti iki kez çalıştırılsa da ne satır çoğalır ne bir sayaç kayar. Güvenlik süzgecinin veya coğrafi çitin elediği hiçbir kayıt veritabanına ulaşmaz. Tekilleştirme hâlâ git defterinden gelir; D1 eklemedir. Bu adım tek bir sır ister, `CLOUDFLARE_API_TOKEN`; sır yoksa adım gerekçesini günlüğe yazıp atlanır ve boru hattının geri kalanı bugünkü gibi sırsız, hesapsız ve ödeme yöntemsiz çalışır.

### Zamanlayıcı (henüz dağıtılmadı)

```bash
cd apps/scheduler
npm ci
npm test                       # workerd içinde çalışan testler; kimlik bilgisi gerekmez
npx wrangler deploy --dry-run  # derleme ve yapılandırma denetimi; dağıtım yok
```

[`apps/scheduler`](apps/scheduler), cron tetikleyicisiyle `collect.yml` iş akışını `workflow_dispatch` üzerinden başlatan Cloudflare Worker'ıdır; amacı GitHub'ın kendi `schedule:` tetikleyicisinin yerini almaktır (o, 60 gün sessizlikten sonra devre dışı kalır). Dağıtım tek bir sır ister: `GITHUB_DISPATCH_TOKEN` — yalnızca bu depoda `Actions: write` yetkisi olan ince ayarlı bir token. Sır yoksa Worker günlüğe yüksek sesle hata yazar ve hiçbir şey tetiklemez; kimliksiz çağrı denemez. Tetikleyicinin `schedule:`'dan Worker'a taşınması ayrı bir karar ve ayrı bir PR'dır: [apps/scheduler/README.md](apps/scheduler/README.md).

### Yayıncılar (yalnızca taslak)

```bash
cd publishers
python -m gt_publishers channels                                    # kanallar, sır adları, hız sınırları
python -m gt_publishers draft --message examples/bulletin.example.json
python -m pip install "pytest>=9,<10" && python -m pytest -q tests
```

Standart kütüphane dışında bağımlılık yok ve gönderim yolu yok: bir modül ağ kütüphanesi içe aktarırsa test kırılır.

### Yayın

`main` dalına giren her değişiklik [`.github/workflows/pages.yml`](.github/workflows/pages.yml) ile GitHub Pages'e yayımlanır. Değişiklikler dal + PR ile gelir; `main` korumalıdır.

Sosyal kanallara (Telegram, Bluesky) **hiçbir şey gönderilmez**: [`publishers`](publishers) yalnızca taslak üretir, ağ istemcisi yoktur ve [`publishers-draft.yml`](.github/workflows/publishers-draft.yml) yalnızca elle, zorunlu bir onay girdisiyle çalışır. Kanalları açmak için gereken adımlar: [publishers/README.md](publishers/README.md).

Hesap gerektirmeyen kamu akışı `datasets` deposundadır: `feed.xml` (RSS), `feed.json` (JSON Feed) ve 7 günlük `feed.md` özeti, <https://greater-turkiye.github.io/datasets/> altında.

### Katkı

Önce [katkı rehberi](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) ve [kırmızı çizgiler](https://github.com/Greater-Turkiye/handbook/blob/main/tr/02-red-lines.md). Mimari ve aşamalar: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md). Yapay zekâ aracıları için depo kuralları: [CLAUDE.md](CLAUDE.md).

### Lisans

Kod [MIT](LICENSE). Üretilen veriler `datasets` deposunda CC BY 4.0 ile yayımlanır. Üçüncü taraf veri ve yazı tiplerinin künyesi [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md) içindedir.

---

## English

### What is in this repository?

| Part | Status | Description |
|---|---|---|
| [`apps/web`](apps/web) | **Live** | The static site: the globe on the home page, the OSINT dashboard and the methodology page. No build step; D3 and topojson-client are vendored. Layer list: [apps/web/README.md](apps/web/README.md) |
| [`tools/geo`](tools/geo) | **Working** | Python builders that construct the map layers reproducibly from official sources (Blue Homeland, TRNC licence areas, the Sea of Marmara and the Straits, diplomatic missions, announced operation areas) |
| [`collectors`](collectors) | **Working** | Python collectors that run in GitHub Actions **every day**: RSS ingest, normalisation, near-duplicate removal (simhash), the safety filter and the geofence, then a **relevance filter** over the watch regions and the recorded event types. What is left goes to a human in an issue labelled `inceleme-kuyrugu` ([collect.yml](.github/workflows/collect.yml)) and the whole run is written into the `gt-signals` D1 database; sending to ingest stays off until the `api` Worker exists |
| [`db`](db) | **Provisioned** | Cloudflare D1 schema and migrations (`signals`, `ops`); both databases created, the `signals` migrations applied and the daily collection now writes there; `ops` is still empty and no Worker is bound |
| [`apps/scheduler`](apps/scheduler) | **In progress** | The Cloudflare Worker whose cron trigger starts the `collect.yml` workflow with `workflow_dispatch`: the code and its tests are here ([scheduler-ci](.github/workflows/scheduler-ci.yml)), but it is **not deployed yet**. The collector trigger stays on `schedule:` until the Worker runs and a decision superseding [ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md) is written |
| [`apps/api`](apps/api), [`apps/review-bot`](apps/review-bot) | **Planned** | Cloudflare Workers: the ingest endpoint and the Telegram review bot. Design notes only for now |
| [`publishers`](publishers) | **Draft** | The design and a **runnable but inert** skeleton of the publishing channels (Telegram, Bluesky, RSS relay): message contract, content checks, rate limits and the human-approval gate. No network client, no credential, no channel switched on. The public feed itself is built in `datasets` |

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
# http://127.0.0.1:8765/platform/            → home
# http://127.0.0.1:8765/platform/panel.html   → dashboard
# http://127.0.0.1:8765/platform/method.html  → method
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

# build the review queue locally: candidate list + issue body, nothing is sent
uv run gt-collect --queue-dir queue --state state/seen.jsonl

# write the same run into the `gt-signals` D1 database (--d1-dry-run prints the SQL instead)
uv run gt-collect --write-d1 queue --d1-dry-run
```

The safety filter (`safety.py`) and the geofence (`geo.py`) run before anything is written to storage.

The **relevance filter** (`relevance.py`) runs after them: it gives each candidate a watch-region signal (country and place names, Turkish and English) and a topic signal (military activity, exercises, procurement, airspace, maritime incidents, basing, sanctions), and combines them as `0.5 × region + 0.5 × topic`, scoring zero when either signal is zero. The threshold is **0.5**; a score of 0.40–0.50 still enters the queue, marked ❓ `borderline`. Anything below is **not deleted**: it stays in the run artifact with `status: off-topic`, is counted in the issue's table, and is never written to the dedup ledger. The region and keyword tables are data, not code ([`collectors/src/gt_collectors/data/relevance.yaml`](collectors/src/gt_collectors/data/relevance.yaml)); [collectors/README.md](collectors/README.md#i̇lgi-süzgeci--relevance-filter) says how to extend them. The filter is for noise only: it never stands in for, or weakens, the safety filter.

[`.github/workflows/collect.yml`](.github/workflows/collect.yml) runs every day at 05:23 UTC and on demand: it collects the feeds whose terms are on record, applies the safety filter, drops repeats, applies the relevance filter and writes what is left into a single dated issue. Nothing in that issue is verified; a human decides. The deduplication ledger lives on the `collector-state` branch ([collectors/state](collectors/state)).

After the issue exists, one last step writes the **whole** run — queued, deferred and off-topic items alike, each with its triage status — into the `gt-signals` D1 database ([db/README.md](db/README.md)): the issue is the human's view, the database is the history. The write is `INSERT … ON CONFLICT(content_hash) DO NOTHING`, so running the same batch twice adds no row and moves no counter. Nothing the safety filter or the geofence dropped ever reaches the database. Deduplication still comes from the git ledger; D1 is additive. This step needs exactly one secret, `CLOUDFLARE_API_TOKEN`; without it the step says so in the log and is skipped, and the rest of the pipeline runs as it does today, with no secrets, no accounts and no payment method.

### Scheduler (not deployed yet)

```bash
cd apps/scheduler
npm ci
npm test                       # the tests run inside workerd; no credentials needed
npx wrangler deploy --dry-run  # build and configuration check; nothing is deployed
```

[`apps/scheduler`](apps/scheduler) is the Cloudflare Worker whose cron trigger starts the `collect.yml` workflow through `workflow_dispatch`; it exists to replace GitHub's own `schedule:` trigger, which is disabled after 60 quiet days. Deploying it needs exactly one secret: `GITHUB_DISPATCH_TOKEN`, a fine-grained token with `Actions: write` on this repository and nothing else. Without the secret the Worker logs a loud error and dispatches nothing; it never falls back to an unauthenticated call. Moving the trigger from `schedule:` to the Worker is a separate decision and a separate pull request: [apps/scheduler/README.md](apps/scheduler/README.md).

### Publishers (drafts only)

```bash
cd publishers
python -m gt_publishers channels                                    # channels, secret names, rate limits
python -m gt_publishers draft --message examples/bulletin.example.json
python -m pip install "pytest>=9,<10" && python -m pytest -q tests
```

No dependency beyond the standard library, and no way to post: a test fails if any module there imports a networking library.

### Deployment

Every change that lands on `main` is published to GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Changes arrive by branch and pull request; `main` is protected.

**Nothing is posted to the social channels** (Telegram, Bluesky): [`publishers`](publishers) only drafts, it has no network client, and [`publishers-draft.yml`](.github/workflows/publishers-draft.yml) runs by hand only, behind a required confirmation input. The steps needed to switch a channel on are in [publishers/README.md](publishers/README.md).

The account-free public feed lives in the `datasets` repository: `feed.xml` (RSS), `feed.json` (JSON Feed) and a 7-day `feed.md` digest, under <https://greater-turkiye.github.io/datasets/>.

### Contributing

Start with the [contributing guide](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) and the [red lines](https://github.com/Greater-Turkiye/handbook/blob/main/en/02-red-lines.md). Architecture and phases: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md). Repository rules for AI agents: [CLAUDE.md](CLAUDE.md).

### Licence

Code is [MIT](LICENSE). Data is published in the `datasets` repository under CC BY 4.0. Third-party data and fonts are credited in [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md).
