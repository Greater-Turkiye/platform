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
| [`apps/web`](apps/web) | **Yayında** | Statik site: ana sayfadaki dünya küresi, OSINT paneli ve yöntem sayfası. Derleme adımı yok; D3 ve topojson-client depoda barındırılır. Panelin altında **kendi vektör altlığımız** vardır (MapLibre GL): karolar `gt-tiles` Worker'ından gelir, varsayılan açıktır, `panel.html?basemap=0` ile kapatılır. Katman listesi: [apps/web/README.md](apps/web/README.md) |
| [`apps/site`](apps/site) | **Yayında** | Statik siteyi Cloudflare'in kenarından sunan Worker: kendi başlıkları (CSP, `referrer-policy`, dosya türüne göre `cache-control`) ve veri dışa aktarımını **aynı kökende** veren bir vekil (`/datasets/…`, beyaz listeli, kenarda önbellekli). GitHub Pages kanonik adres olarak kalır; ikisi aynı commit'ten aynı dosyaları sunar / the Worker that serves the static site from the edge, with our own headers and the dataset export on the same origin; GitHub Pages stays canonical |
| [`apps/tiles`](apps/tiles) | **Yayında** | Panelin vektör altlığını sunan Cloudflare Worker'ı: paneldeki bölgenin OpenStreetMap kesitini (PMTiles arşivi, z0–11) bayt aralıklarıyla okur ve MapLibre'a karo karo verir. Sırrı yoktur, hiçbir şey yazmaz. Arşiv bu deponun sürüm varlığında durur; R2 hesapta açıldığında tek satırlık bir değişiklikle oraya taşınır ([ADR 0018](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0018-self-hosted-vector-basemap.md)) |
| [`tools/perf`](tools/perf) | **Çalışıyor** | Siteyi ölçen performans motoru: headless Chrome'u CPU kısarak sürer, kare süreleri, bloke süre ve betik/yerleşim/biçem maliyetini raporlar; `runs.json` içindeki bütçe aşılırsa sıfırdan farklı çıkar |
| [`tools/trade`](tools/trade) | **Çalışıyor** | Türkiye'nin ilan ettiği İsrail ticareti durdurma kararını iki devletin kendi aylık beyanlarıyla karşılaştıran seri üreticisi (UN Comtrade, anahtarsız). Gemi izlemez |
| [`tools/vessels`](tools/vessels) | **Çalışıyor** | Yaptırım listelerinden gemi **kimliği**: ad, IMO, bayrak ve kayıtlı önceki bayrak (OFAC kamu malı + BM). Konum, rota, mürettebat alanı yoktur |
| [`tools/air`](tools/air) | **Çalışıyor** | Uçuş bilgi bölgeleri (FIR) ve her denizin hava sahasının bölünmesi; açık lisanslı topluluk verisi, **şematik**, seyrüsefer için değil |
| [`tools/geo`](tools/geo) | **Çalışıyor** | Harita katmanlarını resmî kaynaklardan yeniden üretilebilir şekilde kuran Python betikleri (Mavi Vatan, KKTC ruhsat sahaları, Marmara ve Boğazlar, temsilcilikler, harekât bölgeleri) |
| [`collectors`](collectors) | **Çalışıyor** | GitHub Actions'ta **her gün çalışan** Python toplayıcılar: RSS alımı, normalleştirme, tekrar eleme (simhash), güvenlik süzgeci ve coğrafi çit, ardından izleme bölgelerine ve olay türlerine göre **ilgi süzgeci**. Kalan adaylar `inceleme-kuyrugu` etiketli bir konuda insan incelemesine sunulur ([collect.yml](.github/workflows/collect.yml)) ; çalışmanın tamamı `collector-state` dalına bir parti dosyası olarak yayımlanır ve oradan `gt-signals` ile `gt-ops.reviews` içine `apps/ingest` Worker'ı tarafından çekilir — iş akışının hiçbir sırrı yoktur; ingest'e gönderim `api` Worker'ı gelene kadar kapalı |
| [`db`](db) | **Kurulu** | Cloudflare D1 şeması ve migration'lar (`signals`, `ops`); iki veritabanının migration'ları uygulandı. Günlük toplama partisini yayımlar; `gt-signals` ile `gt-ops.reviews` yazmalarını dağıtılmış olan [`apps/ingest`](apps/ingest) Worker'ı yapar |
| [`apps/scheduler`](apps/scheduler) | **Devam ediyor** | Cron tetikleyicisiyle çalışan, `collect.yml` iş akışını `workflow_dispatch` ile başlatan Cloudflare Worker'ı: kod ve testleri hazır ([scheduler-ci](.github/workflows/scheduler-ci.yml)), **henüz dağıtılmadı**. Toplayıcı tetikleyicisi, Worker dağıtılıp [ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md)'yı geçersiz kılan bir karar yazılana kadar `schedule:` üzerinde kalır |
| [`apps/review-bot`](apps/review-bot) | **Yayında** | Özel Telegram inceleme botu (Cloudflare Worker): bekleyen adayları telefonda gösterir, `onayla` / `reddet` / `sonra` kararını `gt-ops` veritabanına yazar. Hiçbir yere yayın yapmaz, PR açmaz; onay yalnızca "taslağa uygun" işaretidir. Kuyruğunu günlük toplama doldurur. Worker 2026-09-18'de dağıtıldı ([review-bot-ci](.github/workflows/review-bot-ci.yml)); 2026-09-20'de **bağlandı**: bot hesabı açıldı, dört sır Cloudflare'de oluşturuldu, webhook kuruldu, bakımcı `reviewers` tablosuna eklendi. Sırların hiçbiri depoda değildir |
| [`apps/ingest`](apps/ingest) | **Yayında** | Cron tetikleyicisiyle çalışan Cloudflare Worker'ı: toplayıcı çalışmasının `collector-state` dalına yayımladığı partiyi çeker ve `gt-signals` ile `gt-ops.reviews` içine yazar. **Hiçbir sır istemez** — yazma yetkisi hesabın kendi D1 bağlamalarıdır. 2026-09-17'de dağıtıldı; günde iki kez (05:53 ve 17:53 UTC) çalışır ([ingest-ci](.github/workflows/ingest-ci.yml)) |
| [`apps/api`](apps/api) | **Planlandı** | Cloudflare Worker: alım ucu (`/v1/ingest`). Şimdilik yalnızca tasarım notları |
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

# Aynı çalışmayı D1'e giden parti olarak yayımla (sır gerekmez)
uv run gt-collect --publish-batch queue --batch-dir state/batches --run-id local

# Ya da yerelden doğrudan D1'e yaz (wrangler login; SQL'i görmek için --d1-dry-run)
uv run gt-collect --write-d1 queue --d1-dry-run
```

Güvenlik süzgeci (`safety.py`) ve coğrafi çit (`geo.py`), veri diske yazılmadan önce çalışır.

Sonra **ilgi süzgeci** (`relevance.py`) gelir: her adaya bir izleme bölgesi sinyali (ülke ve yer adları, TR + EN) ile bir konu sinyali (askerî faaliyet, tatbikat, tedarik, hava sahası, deniz olayı, üs anlaşması, yaptırım) verir ve ikisini `0.5 × bölge + 0.5 × konu` olarak birleştirir; iki sinyalden biri sıfırsa puan sıfırdır. Eşik **0.5**; 0.40–0.50 arası satırlar ❓ `sınırda` işaretiyle yine kuyruğa girer. Eşiğin altındakiler **silinmez**: çalışma yapıtında `status: off-topic` olarak kalır, konudaki sayaç tablosunda görünür ve tekilleştirme defterine yazılmaz. Bölge ve anahtar sözcük tabloları koddan ayrıdır ([`collectors/src/gt_collectors/data/relevance.yaml`](collectors/src/gt_collectors/data/relevance.yaml)); nasıl genişletileceği [collectors/README.md](collectors/README.md#i̇lgi-süzgeci--relevance-filter) içindedir. Bu süzgeç yalnızca gürültü içindir: güvenlik süzgecinin yerine geçmez, onu zayıflatamaz.

[`.github/workflows/collect.yml`](.github/workflows/collect.yml) her gün 05:23 UTC'de (ve elle tetiklenerek) çalışır: koşulları kayda geçmiş akışları toplar, güvenlik süzgecinden geçirir, tekrarları eler, ilgi süzgecini uygular ve kalan adayları tarihli tek bir konuya yazar. Konudaki hiçbir öğe doğrulanmış değildir; kararı insan verir. Tekilleştirme defteri `collector-state` dalında tutulur ([collectors/state](collectors/state)).

Konu açıldıktan sonra son bir adım, çalışmanın **tamamını** — kuyruğa girenleri, sonraki çalışmaya kalanları ve konu dışı bulunanları — kendi triyaj durumlarıyla tek bir **parti dosyası** olarak `collector-state` dalına yayımlar ([collectors/state](collectors/state)); oradan `gt-signals` D1 veritabanına yazan, [`apps/ingest`](apps/ingest) Worker'ıdır ([db/README.md](db/README.md)). Konu insanın gördüğü liste, veritabanı ise geçmiştir. Yazma `INSERT … ON CONFLICT(content_hash) DO NOTHING` olduğu için aynı parti iki kez işlense de ne satır çoğalır ne bir sayaç kayar. Güvenlik süzgecinin veya coğrafi çitin elediği hiçbir kayıt ne yayımlanan dosyaya ne de veritabanına ulaşır. Tekilleştirme hâlâ git defterinden gelir; D1 eklemedir.

Aynı adım, **yalnızca insana sunulan** adayları (konuya giren satırlar) `gt-ops.reviews` tablosuna yazar: Telegram inceleme botunun ([apps/review-bot](apps/review-bot)) okuduğu kuyruk budur. Sonraki çalışmaya kalan ve konu dışı bulunan öğeler kuyruğa girmez. Konudaki tekilleştirme kimliği ile `reviews.content_hash` aynı değerdir (ilk 12 karakter), yani konu ile bot aynı öğeyi iki kez saymaz; `content_hash` UNIQUE olduğu için yeniden çalıştırma ne satır çoğaltır ne de gözden geçiricinin verdiği kararı geri alır.

**Bu boru hattının hiçbir sırrı yoktur.** D1'e yazmak için eskiden gereken `CLOUDFLARE_API_TOKEN` artık gerekmez: veriyi Actions itmez, Worker çeker ve Worker zaten veritabanlarının sahibi olan Cloudflare hesabının içinde çalışır. `collect.yml` içindeki eski itme adımı yerinde durur ama sır olmadığı için atlanır — beklenen durum budur; aynı komut bir bakımcının makinesinde `wrangler login` ile hâlâ çalışır. Hesap ya da ödeme yöntemi de gerekmez.

### Alım Worker'ı (henüz dağıtılmadı)

```bash
cd apps/ingest
npm ci
npm test                       # workerd içinde çalışan testler; kimlik bilgisi gerekmez
npx wrangler deploy --dry-run  # derleme ve yapılandırma denetimi; dağıtım yok
```

[`apps/ingest`](apps/ingest), günlük toplama çalışmasının `collector-state` dalına yayımladığı partiyi cron tetiklemesiyle çeken ve `gt-signals` ile `gt-ops.reviews` içine yazan Cloudflare Worker'ıdır. 2026-09-17'de dağıtıldı; dağıtımı tek komuttur ve **hiçbir sır istemez** (`npx wrangler deploy`): yazma yetkisi, veritabanlarının sahibi olan hesabın kendi D1 bağlamalarıdır. Okuduğu dosya güvenilmez sayılır — her satır `signals` şemasına göre denetlenir, satır sayısı sınırlanır ve uymayan dosya tamamen reddedilir. İşlediği parti `ops.collector_state` içine yazıldığı ve her iki ekleme de `ON CONFLICT DO NOTHING` olduğu için yeniden çalıştırma zararsızdır: ne satır çoğalır, ne verilmiş bir karar geri alınır. Herkese açık yazan uç noktası yoktur.

### Zamanlayıcı (henüz dağıtılmadı)

```bash
cd apps/scheduler
npm ci
npm test                       # workerd içinde çalışan testler; kimlik bilgisi gerekmez
npx wrangler deploy --dry-run  # derleme ve yapılandırma denetimi; dağıtım yok
```

[`apps/scheduler`](apps/scheduler), cron tetikleyicisiyle `collect.yml` iş akışını `workflow_dispatch` üzerinden başlatan Cloudflare Worker'ıdır; amacı GitHub'ın kendi `schedule:` tetikleyicisinin yerini almaktır (o, 60 gün sessizlikten sonra devre dışı kalır). Dağıtım tek bir sır ister: `GITHUB_DISPATCH_TOKEN` — yalnızca bu depoda `Actions: write` yetkisi olan ince ayarlı bir token. Sır yoksa Worker günlüğe yüksek sesle hata yazar ve hiçbir şey tetiklemez; kimliksiz çağrı denemez. Tetikleyicinin `schedule:`'dan Worker'a taşınması ayrı bir karar ve ayrı bir PR'dır: [apps/scheduler/README.md](apps/scheduler/README.md).

### İnceleme botu (dağıtılmadı)

```bash
cd apps/review-bot
npm ci
npm test                       # workerd içinde çalışan testler; kimlik bilgisi gerekmez
npx wrangler deploy --dry-run  # derleme ve yapılandırma denetimi; dağıtım yok
```

Özel bir Telegram sohbetinde çalışan Cloudflare Worker'ı: `/kuyruk`, `/sonraki`, `/goster <id>`, `/durum` komutları ve her adayın altında `✅ Onayla` · `🚫 Reddet` · `⏭ Sonra` düğmeleri. Karar, gözden geçirici ve zaman damgasıyla `gt-ops.reviews` tablosuna yazılır. **Onay yayın değildir:** yalnızca `status = 'drafted'` işaretidir; kayıt hâlâ `datasets` deposunda `kayda-gec` etiketiyle bir insan tarafından açılır. Türk kuvvetlerinden söz eden aday metni hiç aktarılmaz, yalnızca bağlantı gösterilir. Sırların adları, botun BotFather ile oluşturulması, webhook'un kurulması ve iptali: [apps/review-bot/README.md](apps/review-bot/README.md). Worker, dört sırrı da Cloudflare'de bulmadan hiçbir isteği kabul etmez; 2026-09-20'den beri bağlıdır.

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

Sosyal kanallara (Telegram, Bluesky) **hiçbir şey gönderilmez**: [`publishers`](publishers) yalnızca taslak üretir, ağ istemcisi yoktur ve [`publishers-draft.yml`](.github/workflows/publishers-draft.yml) yalnızca elle, zorunlu bir onay girdisiyle çalışır. Kanalları açmak için gereken adımlar: [publishers/README.md](publishers/README.md). [`apps/review-bot`](apps/review-bot) bağlıdır ama yayın yapmaz: yalnızca tek bir **özel** inceleme sohbetine yazar, herkese açık hiçbir kanala göndermez.

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
| [`apps/web`](apps/web) | **Live** | The static site: the globe on the home page, the OSINT dashboard and the methodology page. No build step; D3 and topojson-client are vendored. The dashboard draws on **our own vector basemap** (MapLibre GL): the tiles come from the `gt-tiles` Worker, on by default, off with `panel.html?basemap=0`. Layer list: [apps/web/README.md](apps/web/README.md) |
| [`apps/site`](apps/site) | **Live** | The Worker that serves the static site from Cloudflare's edge: our own headers (CSP, referrer policy, per-type cache lifetimes) and a same-origin proxy for the dataset export (`/datasets/…`, allow-listed, edge-cached). GitHub Pages stays the canonical address; both serve the same files from the same commit |
| [`apps/tiles`](apps/tiles) | **Live** | The Cloudflare Worker that serves the dashboard's vector basemap: it reads byte ranges out of our OpenStreetMap extract of the region (a PMTiles archive, z0–11) and hands MapLibre one tile per request. It has no secret and writes nothing. The archive is a release asset of this repository; the day R2 is enabled on the account it moves there in one line ([ADR 0018](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0018-self-hosted-vector-basemap.md)) |
| [`tools/perf`](tools/perf) | **Working** | The performance engine: drives headless Chrome under CPU throttling and reports frame times, blocked time and where the time went; exceeding a budget in `runs.json` exits non-zero |
| [`tools/trade`](tools/trade) | **Working** | Builds the series that sets Türkiye's declared halt of trade with Israel against both states' own monthly returns (UN Comtrade, no key). It tracks no vessel |
| [`tools/vessels`](tools/vessels) | **Working** | Vessel **identity** from the sanctions lists: name, IMO, flag and recorded former flag (OFAC, public domain, plus the UN). It has no field for a position, a route or a crew |
| [`tools/air`](tools/air) | **Working** | Flight information regions and how each sea's airspace divides between them; openly licensed community data, **schematic**, not for navigation |
| [`tools/geo`](tools/geo) | **Working** | Python builders that construct the map layers reproducibly from official sources (Blue Homeland, TRNC licence areas, the Sea of Marmara and the Straits, diplomatic missions, announced operation areas) |
| [`collectors`](collectors) | **Working** | Python collectors that run in GitHub Actions **every day**: RSS ingest, normalisation, near-duplicate removal (simhash), the safety filter and the geofence, then a **relevance filter** over the watch regions and the recorded event types. What is left goes to a human in an issue labelled `inceleme-kuyrugu` ([collect.yml](.github/workflows/collect.yml)) ; the whole run is published to the `collector-state` branch as a batch file, from which the `apps/ingest` Worker pulls it into `gt-signals` and `gt-ops.reviews` — the workflow holds no secret; sending to ingest stays off until the `api` Worker exists |
| [`db`](db) | **Provisioned** | Cloudflare D1 schema and migrations (`signals`, `ops`); both databases have their migrations applied. The daily collection publishes its batch and the [`apps/ingest`](apps/ingest) Worker writes it into `gt-signals` and `gt-ops.reviews` — the first Worker to be bound, once it is deployed |
| [`apps/scheduler`](apps/scheduler) | **In progress** | The Cloudflare Worker whose cron trigger starts the `collect.yml` workflow with `workflow_dispatch`: the code and its tests are here ([scheduler-ci](.github/workflows/scheduler-ci.yml)), but it is **not deployed yet**. The collector trigger stays on `schedule:` until the Worker runs and a decision superseding [ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md) is written |
| [`apps/review-bot`](apps/review-bot) | **In progress** | The private Telegram review bot (a Cloudflare Worker): it shows the waiting candidates on a phone and writes the `onayla` / `reddet` / `sonra` decision to the `gt-ops` database. It posts nothing anywhere and opens no pull request; approval is only a mark that the item is fit for a draft record. Its queue is filled by the daily collection run. The code and its tests are here and the Worker was deployed on 2026-09-18 ([review-bot-ci](.github/workflows/review-bot-ci.yml)), but **without its secrets it refuses every request**: the bot secrets and the reviewer row in `reviewers` are still missing |
| [`apps/ingest`](apps/ingest) | **Live** | The Cloudflare Worker whose cron trigger pulls the batch the collector run published to the `collector-state` branch and writes it into `gt-signals` and `gt-ops.reviews`. It needs **no secret**: its authorisation to write is the account's own D1 bindings. Deployed on 2026-09-17; it runs twice a day, at 05:53 and 17:53 UTC ([ingest-ci](.github/workflows/ingest-ci.yml)) |
| [`apps/api`](apps/api) | **Planned** | A Cloudflare Worker: the ingest endpoint (`/v1/ingest`). Design notes only for now |
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

# publish the same run as the batch that goes into D1 (no secret needed)
uv run gt-collect --publish-batch queue --batch-dir state/batches --run-id local

# or write straight into D1 from this machine (wrangler login; --d1-dry-run prints the SQL)
uv run gt-collect --write-d1 queue --d1-dry-run
```

The safety filter (`safety.py`) and the geofence (`geo.py`) run before anything is written to storage.

The **relevance filter** (`relevance.py`) runs after them: it gives each candidate a watch-region signal (country and place names, Turkish and English) and a topic signal (military activity, exercises, procurement, airspace, maritime incidents, basing, sanctions), and combines them as `0.5 × region + 0.5 × topic`, scoring zero when either signal is zero. The threshold is **0.5**; a score of 0.40–0.50 still enters the queue, marked ❓ `borderline`. Anything below is **not deleted**: it stays in the run artifact with `status: off-topic`, is counted in the issue's table, and is never written to the dedup ledger. The region and keyword tables are data, not code ([`collectors/src/gt_collectors/data/relevance.yaml`](collectors/src/gt_collectors/data/relevance.yaml)); [collectors/README.md](collectors/README.md#i̇lgi-süzgeci--relevance-filter) says how to extend them. The filter is for noise only: it never stands in for, or weakens, the safety filter.

[`.github/workflows/collect.yml`](.github/workflows/collect.yml) runs every day at 05:23 UTC and on demand: it collects the feeds whose terms are on record, applies the safety filter, drops repeats, applies the relevance filter and writes what is left into a single dated issue. Nothing in that issue is verified; a human decides. The deduplication ledger lives on the `collector-state` branch ([collectors/state](collectors/state)).

After the issue exists, one last step publishes the **whole** run — queued, deferred and off-topic items alike, each with its triage status — to the `collector-state` branch as a single **batch file** ([collectors/state](collectors/state)); the thing that writes it into the `gt-signals` D1 database is the [`apps/ingest`](apps/ingest) Worker ([db/README.md](db/README.md)). The issue is the human's view, the database is the history. The write is `INSERT … ON CONFLICT(content_hash) DO NOTHING`, so processing the same batch twice adds no row and moves no counter. Nothing the safety filter or the geofence dropped reaches the published file, let alone the database. Deduplication still comes from the git ledger; D1 is additive.

The same step then writes the candidates that were **actually put in front of a human** — the lines in the issue, and nothing else — into `gt-ops.reviews`, which is the queue the Telegram review bot ([apps/review-bot](apps/review-bot)) reads. Deferred and off-topic items do not enter it. The dedup id in the issue is the first 12 characters of `reviews.content_hash`, so the issue and the bot cannot count the same candidate twice, and because that column is UNIQUE a re-run adds no row and cannot undo a reviewer's decision.

**This pipeline holds no secret at all.** The `CLOUDFLARE_API_TOKEN` that writing to D1 used to need is gone: Actions does not push the data, the Worker pulls it, and the Worker already runs inside the Cloudflare account that owns the databases. The old push step is still in `collect.yml` but skips itself for want of a secret, which is now the expected state; the same command still works on a maintainer's machine behind `wrangler login`. No accounts and no payment method either.

### Ingest Worker (not deployed yet)

```bash
cd apps/ingest
npm ci
npm test                       # the tests run inside workerd; no credentials needed
npx wrangler deploy --dry-run  # build and configuration check; nothing is deployed
```

[`apps/ingest`](apps/ingest) is the Cloudflare Worker whose cron trigger pulls the batch the daily collection run published to the `collector-state` branch and writes it into `gt-signals` and `gt-ops.reviews`. **Deploying it is one command and needs no secret** (`npx wrangler deploy`): its authorisation to write is the D1 bindings of the account that owns the databases. The file it reads is treated as untrusted — every row is checked against the `signals` schema, the row count is capped, and a file that does not match is refused whole. The batch it processed is recorded in `ops.collector_state` and both inserts are `ON CONFLICT DO NOTHING`, so re-running is harmless: no row is duplicated and no decision is undone. It has no public write endpoint.

### Scheduler (not deployed yet)

```bash
cd apps/scheduler
npm ci
npm test                       # the tests run inside workerd; no credentials needed
npx wrangler deploy --dry-run  # build and configuration check; nothing is deployed
```

[`apps/scheduler`](apps/scheduler) is the Cloudflare Worker whose cron trigger starts the `collect.yml` workflow through `workflow_dispatch`; it exists to replace GitHub's own `schedule:` trigger, which is disabled after 60 quiet days. Deploying it needs exactly one secret: `GITHUB_DISPATCH_TOKEN`, a fine-grained token with `Actions: write` on this repository and nothing else. Without the secret the Worker logs a loud error and dispatches nothing; it never falls back to an unauthenticated call. Moving the trigger from `schedule:` to the Worker is a separate decision and a separate pull request: [apps/scheduler/README.md](apps/scheduler/README.md).

### Review bot (not deployed)

```bash
cd apps/review-bot
npm ci
npm test                       # the tests run inside workerd; no credentials needed
npx wrangler deploy --dry-run  # build and configuration check; nothing is deployed
```

A Cloudflare Worker that works in one private Telegram chat: the commands `/kuyruk`, `/sonraki`, `/goster <id>` and `/durum`, and `✅ Onayla` · `🚫 Reddet` · `⏭ Sonra` buttons under each candidate. The decision is written to `gt-ops.reviews` with the reviewer and a timestamp. **Approval is not publication:** it only sets `status = 'drafted'`; the record is still opened by a human in the `datasets` repository through the `kayda-gec` label. Candidate text that names Turkish forces is never relayed — the bot shows the link only. Secret names, how to create the bot with BotFather, and how to set and revoke the webhook: [apps/review-bot/README.md](apps/review-bot/README.md). Without its secrets the Worker refuses every request.

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

**Nothing is posted to the social channels** (Telegram, Bluesky): [`publishers`](publishers) only drafts, it has no network client, and [`publishers-draft.yml`](.github/workflows/publishers-draft.yml) runs by hand only, behind a required confirmation input. The steps needed to switch a channel on are in [publishers/README.md](publishers/README.md). [`apps/review-bot`](apps/review-bot) is not deployed either, and when it is, it writes to one **private** review chat and to no public channel at all.

The account-free public feed lives in the `datasets` repository: `feed.xml` (RSS), `feed.json` (JSON Feed) and a 7-day `feed.md` digest, under <https://greater-turkiye.github.io/datasets/>.

### Contributing

Start with the [contributing guide](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) and the [red lines](https://github.com/Greater-Turkiye/handbook/blob/main/en/02-red-lines.md). Architecture and phases: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md). Repository rules for AI agents: [CLAUDE.md](CLAUDE.md).

### Licence

Code is [MIT](LICENSE). Data is published in the `datasets` repository under CC BY 4.0. Third-party data and fonts are credited in [apps/web/assets/LICENSES.md](apps/web/assets/LICENSES.md).

### Bağımlılık geçersiz kılmaları / dependency overrides

`apps/ingest`, `apps/review-bot` ve `apps/scheduler` içindeki `package.json` dosyaları
`overrides.sharp` alanında `>=0.35.4` taşır. Sebebi: `sharp` bu depoda doğrudan kullanılmaz, yerel
geliştirme için `wrangler` → `miniflare` zinciriyle gelir. `miniflare` hâlâ `sharp@0.35.2`
sabitliyor ve o sürüm libheif üzerinden iki yüksek önemli açık taşıyor (GHSA-g89c-p67h-r497,
GHSA-2jg2-4ch7-h545, düzeltme 0.35.4). Üst akış sabitlemesini gevşetince bu satır kaldırılmalıdır
— duran bir geçersiz kılma, çözülmüş bir sorunu gizler.

The three Workers pin `sharp` to `>=0.35.4` through `overrides`. It is not used here directly: it
arrives with `wrangler` → `miniflare` for local development, and miniflare still pins a version
carrying two high-severity libheif advisories. Remove the override once upstream moves.

### Metin denetimi / i18n check

```bash
python tools/web/check_i18n.py
```

`GT.t` bulamadığı anahtarın kendisini döndürür ve `applyI18n` onu elemanın içine yazar — yani yanlış
yazılmış bir anahtar hata vermez, **yayımlanır**. Bir sayfa, anahtarı `p.zoom` olduğu için ölçeğin
yanında `P.SCALE` yazar hâlde çıktı. Bu betik her sayfanın kullandığı anahtarları iki tablo ile
karşılaştırır, tek dilde kalmış anahtarları ve iki dilde farklı `{token}` taşıyan satırları bulur.

`GT.t` returns the key itself when it cannot find it, so a mistyped key does not fail — it ships.
This script checks every `data-i18n` key on every page against both tables, and flags keys defined
in one language only or carrying different placeholders in the two.
