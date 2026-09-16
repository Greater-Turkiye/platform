# collectors

[Türkçe](#türkçe) · [English](#english) · [İnceleme kuyruğu / Review queue](#i̇nceleme-kuyruğu--review-queue) · [İlgi süzgeci / Relevance filter](#i̇lgi-süzgeci--relevance-filter) · [Sinyal deposu / Signal store](#sinyal-deposu--signal-store) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: RSS/Atom toplayıcı, güvenlik filtresi, ilgi süzgeci ve **günlük zamanlanmış çalışma** hazır; çalışma, BM akışlarından gelen ve izleme bölgeleriyle ilgili adayları bir GitHub konusunda insan incelemesine sunar. Çalışmanın tamamı ayrıca `gt-signals` D1 veritabanına yazılır. Hiçbir akış ingest'e **gönderilmiyor** (henüz `api` Worker'ı ve `source_id` yok). / Status: the RSS/Atom collector, the safety filter, the relevance filter and a **daily scheduled run** work; the run puts the candidates that concern the watch regions in front of a human in a GitHub issue and writes the whole run into the `gt-signals` D1 database. Nothing is **sent** to ingest yet (no `api` Worker, no `source_id`).
>
> Paket / Package: `gt_collectors` (`src/`), yapılandırma / config: [`config/feeds.yaml`](config/feeds.yaml), kaynaklar / sources: [`sources.md`](sources.md), iş akışı / workflow: [`.github/workflows/collect.yml`](../.github/workflows/collect.yml), durum / state: [`state/`](state/).

---

## Türkçe

Toplayıcılar açık kaynaklardan veri çeken, normalleştiren ve insan incelemesine sunan küçük Python programlarıdır. Bağımlılıklar `uv` ile yönetilir. Bugün çalışan yol GitHub Actions'taki günlük `collect` iş akışıdır (`schedule:` + `workflow_dispatch`); `api` Worker'ı ve `scheduler` Worker'ı devreye girince aynı toplayıcılar HMAC imzalı partileri ingest'e gönderecek.

Kurallar:

- Her toplayıcı yalnızca **herkese açık** kaynaklara, giriş yapmadan ve kaynağın kullanım koşullarına uyarak erişir. Kullanıcı hesabı, çerez hilesi veya ödeme duvarı aşma yok.
- Kaynağa saygılı davranılır: `ETag` / `If-Modified-Since`, makul bekleme süreleri, tanımlayıcı bir `User-Agent`.
- **Türk kuvvetleri güvenlik filtresi** ayrıştırmadan hemen sonra, bellekte ve diske veya ağa hiçbir şey yazılmadan önce çalışır. Atılan kayıtlar günlüğe yazılmaz; yalnızca atılan öğe **sayısı** raporlanır.
- **İlgi süzgeci** (`relevance.py`) yalnızca gürültü içindir ve güvenlik süzgecinden **sonra** çalışır: izleme bölgeleriyle ve kaydettiğimiz olay türleriyle eşleşmeyen adaylar kuyruğa girmez, silinmez ve sayılır. Güvenlik süzgecinin yerine geçmez, onu zayıflatamaz.
- Tam metin yeniden yayımlanmaz; sinyal yalnızca iç inceleme içindir ve 90 gün sonra silinir.
- **Hiçbir şey yayımlanmaz.** Kuyruğa giren her öğe *doğrulanmamış adaydır*; kararı insan verir ([ADR 0007](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0007-human-in-the-loop-publishing.md)).

## English

Collectors are small Python programs that fetch data from public sources, normalize it and put it in front of a human. Dependencies are managed with `uv`. The path that works today is the daily `collect` workflow in GitHub Actions (`schedule:` plus `workflow_dispatch`); once the `api` and `scheduler` Workers exist, the same collectors will also send HMAC-signed batches to ingest.

Rules:

- Every collector accesses **public** sources only, without logging in and within the source's terms of use. No user accounts, cookie tricks or paywall circumvention.
- Be polite to sources: `ETag` / `If-Modified-Since`, sensible back-off, a descriptive `User-Agent`.
- The **Turkish-forces safety filter** runs right after parsing, in memory, before anything is written to disk or the network. Dropped records are never logged; only the **count** of dropped items is reported.
- The **relevance filter** (`relevance.py`) is for noise only and runs **after** the safety filter: candidates that match neither a watch region nor a recorded event type do not enter the queue. They are kept and counted, never deleted, and the filter can never stand in for or weaken the safety filter.
- Full text is never republished; signals are for internal review only and are deleted after 90 days.
- **Nothing is published.** Everything that reaches the queue is an *unverified candidate*; a human decides (ADR 0007).

---

## İnceleme kuyruğu / Review queue

[`.github/workflows/collect.yml`](../.github/workflows/collect.yml) her gün 05:23 UTC'de (ve elle `workflow_dispatch` ile) çalışır:

1. `queue: true` işaretli akışları çeker, ayrıştırır ve normalleştirir;
2. **güvenlik süzgeci ve coğrafi çit** bellekte, hiçbir şey yazılmadan önce çalışır;
3. simhash ile yakın kopyaları ve tekilleştirme defterindeki (`state/seen.jsonl`, `collector-state` dalı) öğeleri eler;
4. kalanları **ilgi süzgecinden** geçirir: izleme bölgeleriyle ve kaydettiğimiz olay türleriyle eşleşmeyenler kuyruğa girmez ([aşağıda](#i̇lgi-süzgeci--relevance-filter));
5. **bütün** partiyi (kuyruğa girenler, ertelenenler ve ilgisiz bulunanlar) JSONL yapıtı olarak yükler ve kuyruğa girenlerle `inceleme-kuyrugu` etiketli, tarihli **tek bir konu** açar (aynı gün ikinci çalışma aynı konuya yorum bırakır);
6. konu açıldıktan **sonra** defteri bot commit'iyle `collector-state` dalına iter — konu açılamazsa öğeler görülmemiş sayılır ve sonraki çalışmada yine sunulur;
7. en son, partinin tamamını `gt-signals` D1 veritabanına yazar ([aşağıda](#sinyal-deposu--signal-store)); `CLOUDFLARE_API_TOKEN` yoksa bu adım gerekçesiyle atlanır.

Konudaki her satır: başlık, kaynak bağlantısı, varsa Wayback arşiv bağlantısı, bölge tahmini, ilgi puanı, akış kimliği ve tekilleştirme kimliği. Çalışma başına en çok 40 aday; gerisi bir sonraki çalışmaya kalır. Konunun başındaki uyarı, öğelerin **doğrulanmamış aday** olduğunu söyler.

`.github/workflows/collect.yml` runs every day at 05:23 UTC, and on demand through `workflow_dispatch`:

1. fetch, parse and normalize the feeds marked `queue: true`;
2. the **safety filter and the geofence** run in memory, before anything is written;
3. near-duplicates (simhash) and anything already in the dedup ledger (`state/seen.jsonl` on the `collector-state` branch) are dropped;
4. the **relevance filter** scores what is left: an item that matches neither a watch region nor a recorded event type does not enter the queue ([below](#i̇lgi-süzgeci--relevance-filter));
5. the **whole** batch (queued, deferred and off-topic) is uploaded as a JSONL artifact, and the queued items are written into **one dated issue** labelled `inceleme-kuyrugu` (a second run on the same day comments on the same issue);
6. **after** the issue exists, the ledger is pushed to `collector-state` as a bot commit — if the issue could not be opened, the items stay unseen and the next run offers them again;
7. last, the whole batch is written into the `gt-signals` D1 database ([below](#sinyal-deposu--signal-store)); without `CLOUDFLARE_API_TOKEN` that step says so and is skipped.

Each line carries the title, the source link, a Wayback archive link when one exists, the region guess, the relevance score, the feed id and the dedup id. At most 40 candidates per run; the rest wait for the next run. The banner at the top of the issue says that the items are **unverified candidates**.

Ne gerekmez / What it does not need: hesap veya ödeme yöntemi gerekmez; 1-6 arası adımlar yalnızca `GITHUB_TOKEN` ister (`contents: write` ile yalnızca `collector-state` dalı, `issues: write`). Tek isteğe bağlı sır, 7. adımdaki `CLOUDFLARE_API_TOKEN`'dır. / No accounts and no payment method; steps 1-6 need only `GITHUB_TOKEN`. The one optional secret is `CLOUDFLARE_API_TOKEN`, used by step 7.

---

## İlgi süzgeci / Relevance filter

> **Bu süzgeç yalnızca gürültü içindir.** Türk kuvvetleri güvenlik süzgeci (`safety.py`) ve coğrafi çit (`geo.py`) ondan **önce** çalışır, değişmemiştir ve bu tablolardan etkilenmez: yüksek puan almak, güvenlik süzgecinin attığı bir kaydı geri getirmez. / **This filter is for noise only.** The Turkish-forces safety filter and the geofence run **before** it, unchanged, and no table here can weaken them: scoring well is not a way back in for a record the safety filter dropped.

İlk gerçek çalışmada (konu #41) kuyruğa giren 10 maddenin çoğu izleme bölgeleriyle ilgisiz BM dünya haberiydi (Haiti, Güney Sudan, El Niño) ve bölge tahmini hepsine `global` diyordu. Süzgeç her adaya iki soru sorar. / In the first real run (issue #41) most of the ten queued items were UN world news with no bearing on the watch regions, and every region guess was `global`. The filter asks two questions about each candidate:

| | |
|---|---|
| **Bölge sinyali / region signal** | Ülke, başkent ve büyük yer adları, sıfatlar ve halk adları (TR + EN), `datasets/vocab/regions.yaml` bölge kodlarına göre. Başlıkta geçen ifade `weights.title`, yalnızca özette geçen `weights.text` eder; ayrı ifadeler toplanır, 1.0'da sınırlanır. Metin hiçbir bölge adı vermezse akışın kendi bölgesi `weights.feed_region` eder. `global` eşleşmez: hiçbir şey tutmadığında kalan değerdir. / Place names, adjectives and demonyms per region code; a title match weighs more than an excerpt match; `global` is the fallback, never a signal. |
| **Konu sinyali / topic signal** | `datasets/vocab/event-types.yaml` kodlarına göre gruplanmış anahtar sözcükler: askerî faaliyet, konuşlanma, tatbikat, tedarik ve savunma sanayii, hava sahası ve deniz olayları, üs anlaşmaları, savunma ticaretine yaptırım. Eşleşen her grup bir kez katkı verir, 1.0'da sınırlanır. / Keyword groups keyed by event-type code: military activity, deployments, exercises, procurement, airspace and maritime incidents, basing, sanctions on defence trade. |

```text
score = weights.region * region_score + weights.topic * topic_score
score = 0                                       if region_score == 0 or topic_score == 0
```

İki sinyal de gerekir. Olaysız bir bölge ("Yemen'in çocuk gelinleri") insan hikâyesidir; bölgesiz bir olay ("Haiti yaptırım komitesi") başkasının mahallesidir. / Both signals are required: a watch-region country with no security event is a human-interest story, and a security event with no watch region is somebody else's neighbourhood.

Eşik **0.5**, belirsizlik payı **0.1** (`data/relevance.yaml`). / The threshold is **0.5** and the uncertainty margin **0.1**:

| Puan / Score | Ne olur / What happens |
|---|---|
| `>= 0.50` | Kuyruğa girer / queued |
| `0.40 – 0.50` | Kuyruğa girer, satırda ❓ `sınırda / borderline` işaretiyle / queued, with a `borderline` marker |
| `< 0.40` | Kuyruğa **girmez** / not queued |

Eşik neden 0.5: iki sinyalin payı eşit olduğundan 0.5, "iki taraftan da en az orta güçte bir kanıt" demektir — başlıkta bir bölge adı ve özette bir olay sözcüğü (0.70) rahatça geçer, yalnız özette birer kez geçen zayıf bir çift (0.40) geçmez ama sessizce de atılmaz. Pay neden 0.1: eşiğin hemen altı çoğunlukla tabloda eksik bir sözcüktür, gerçekten ilgisiz bir madde değil; o yüzden süzgeç "emin değilim" der ve kararı insana bırakır. / Why 0.5: with the two signals weighted equally it means "at least moderate evidence on both sides". Why a margin: a near miss is more often a gap in the tables than a genuinely irrelevant item, so the filter says so instead of dropping it quietly.

**Hiçbir şey kaybolmaz / nothing is lost.** Eşiğin altındaki maddeler çalışma yapıtında `candidates.jsonl` içinde `status: "off-topic"` ile durur, konudaki sayaç tablosunda `İlgisiz / off-topic` satırında sayılır ve **tekilleştirme defterine yazılmaz** — daha iyi bir tablo onları sonraki çalışmada yeniden değerlendirir. / Below-threshold items stay in `candidates.jsonl` with `status: "off-topic"`, are counted in the issue's table, and are never written to the dedup ledger, so a better table picks them up later. `status` üç değer alır / takes three values: `queued`, `deferred`, `off-topic`.

### Tabloları genişletmek / Extending the tables

Tablolar koddan ayrıdır: yeni bir yer adı ya da olay sözcüğü eklemek için **yalnızca** [`src/gt_collectors/data/relevance.yaml`](src/gt_collectors/data/relevance.yaml) düzenlenir. / The tables are data, not code: adding a place name or an event keyword means editing only that one file.

- `regions:` — anahtar `datasets/vocab/regions.yaml`'daki bölge kodudur; altına Türkçe ve İngilizce ifadeleri yazın. `global` buraya yazılamaz. / the key is a region code from the canonical vocabulary; add Turkish and English phrases under it. `global` is rejected.
- `topics:` — anahtar `datasets/vocab/event-types.yaml`'daki olay türü kodudur. / the key is an event-type code.
- `exclude:` — bölge eşleşmesinden önce metinden silinen yanlış arkadaşlar (`south sudan`, Sudan değildir). / false friends blanked out before region matching.
- `weights:`, `threshold:`, `margin:` — puanı ve eşiği ayarlar. / tune the score and the threshold.
- Eşleşme aksan ve büyük/küçük harf duyarsızdır (`İran` = `iran` = `IRAN`) ve sözcük sınırlarına uyar. Sonuna `*` konan ifade ön ek eşleşmesidir: `konuşlan*` → *konuşlandırıldı*. / Matching folds case and diacritics and respects word boundaries; a trailing `*` is a prefix match, which is how Turkish suffixes are handled.

```bash
# Bir tabloyu denemek, hiçbir şey yazmadan / try a table without touching the packaged one
gt-collect --queue-dir queue --relevance my-tables.yaml
# Süzgeci geçici olarak kapatmak (her şey kuyruğa girer) / see everything again
gt-collect --queue-dir queue --min-relevance 0
```

Bir madde yanlış elendiğinde / when an item is filtered out wrongly: `candidates.jsonl` içindeki satırında `relevance.score`, `relevance.region`, `relevance.topics` ve eşleşen ifadeler (`relevance.terms`) yazar; eksik olan sözcüğü tabloya ekleyin ve `tests/fixtures/relevance_cases.json`'a bir örnek koyun. / its artifact line records the score, the region, the matched topic codes and the matched phrases; add the missing word to the table and a case to the fixture file.

Bilerek dışarıda bırakılanlar / deliberately out of scope: Türkiye'nin kendisi bir izleme bölgesi kodu değildir, bu yüzden yalnızca "Türkiye" geçen bir madde bölge sinyali almaz; kanonik listede karşılığı olmayan ülkeler (Afganistan, Pakistan, Hindistan, Çin) de bölge tablosunda yoktur. / Türkiye itself is not a watch-region code, and countries with no home in the canonical region list are not in the table.

---

## Sinyal deposu / Signal store

Konu açıldıktan sonra çalışmanın tamamı Cloudflare D1'deki `gt-signals` veritabanına yazılır ([db/README.md](../db/README.md), şema: `db/migrations/signals/`). Konu insanın gördüğü listedir, veritabanı ise geçmiştir: kuyruğa girenler, sonraki çalışmaya kalanlar ve konu dışı bulunanlar hep birlikte, her biri kendi triyaj durumuyla saklanır. Güvenlik süzgecinin veya coğrafi çitin elediği hiçbir kayıt buraya ulaşmaz; yazıcı, satırları oluşturmadan önce süzgeci bir kez daha uygular.

After the issue exists, the whole run is written into the `gt-signals` database on Cloudflare D1 ([db/README.md](../db/README.md), schema in `db/migrations/signals/`). The issue is the human's view; the database is the history, so queued, deferred and off-topic items are all stored, each with its own triage status. Nothing the safety filter or the geofence dropped can reach it: the writer applies the filter again before it maps a single row.

| Toplayıcı / Collector | `signals` sütunu / column | Not |
|---|---|---|
| `content_hash` | `content_hash` | `sha256:…`, UNIQUE anahtar / the UNIQUE key |
| `simhash` | `simhash` | işaretli 64-bit / signed 64-bit |
| `raw_hash`, `source_id`, `url`, `lang`, `title`, `text` | aynı adla / same name | `text` alıntıdır, tam metin değil / an excerpt, never full text |
| `feed` | `collector_id` | |
| `geo.region` | `region` | |
| `geo` | `geo_json` | yalnızca yer adı veya koordinat varsa / only when there is a place or coordinates |
| `published_at`, `fetched_at` | aynı adla / same name | UTC, `YYYY-MM-DDTHH:MM:SSZ` |
| `status: queued` | `triage_status = 'queued'` | insanın önünde / in front of a human |
| `status: deferred` | `triage_status = 'pending'` | henüz karar yok / nobody has decided yet |
| `status: off-topic` | `triage_status = 'scored'` | ilgi süzgeci eşiği geçmedi / below the relevance threshold |
| `relevance.score` | `triage_score` | |
| akış, kuyruk kimliği, konular, `redline_check` | `triage_labels` | JSON |
| — | `created_at` | veritabanı damgalar / stamped by the database |

`duplicate` ve `dropped` durumlarını toplayıcı hiç yazmaz; onlar triyaj Worker'ınındır. / The collector never writes the `duplicate` and `dropped` statuses; they belong to the triage Worker.

Yazma `INSERT … ON CONFLICT(content_hash) DO NOTHING` biçiminde ve partiler hâlindedir (öntanımlı 25 satır). Aynı parti iki kez yazılırsa ikinci seferde hiçbir satır yazılmaz, hiçbir triyaj durumu değişmez ve günlük yazma bütçesinden hiçbir şey harcanmaz. / The write is `INSERT … ON CONFLICT(content_hash) DO NOTHING`, in batches (25 rows by default). Writing the same batch twice writes nothing the second time, changes no triage status and costs nothing from the daily write budget.

Tekilleştirme hâlâ git defterindedir (`state/seen.jsonl`); D1 şimdilik yalnızca eklemedir. / Deduplication still lives in the git ledger (`state/seen.jsonl`); D1 is additive for now.

```bash
# İş akışının yaptığı: önce kuyruk, sonra depo / what the workflow does: queue first, store after
gt-collect --queue-dir queue --state state/seen.jsonl
gt-collect --write-d1 queue                  # CLOUDFLARE_API_TOKEN ister / needs the token
gt-collect --write-d1 queue --d1-dry-run     # SQL'i yazdırır, hiçbir şeye dokunmaz / prints the SQL
gt-collect --write-d1 queue --d1-database gt-signals-dev --d1-batch 10
```

Tek sır `CLOUDFLARE_API_TOKEN`'dır ve yalnızca ortamdan okunur; depoda hiçbir belirteç tutulmaz. Yerelde `wrangler login` de yeterlidir. İş akışında sır yoksa adım atlanır ve sebebi günlüğe yazılır; boru hattının geri kalanı etkilenmez. / The one secret is `CLOUDFLARE_API_TOKEN`, read from the environment only; no token is ever stored in the repository, and locally `wrangler login` is enough. In the workflow, a missing secret skips the step with a log line and changes nothing else.

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
gt-collect --queue-dir queue --relevance my-tables.yaml     # başka ilgi tablosu / other tables
gt-collect --queue-dir queue --min-relevance 0              # süzgeçsiz / filter off

# Partiyi D1'e yaz (SQL'i görmek için --d1-dry-run) / write the batch to D1 (--d1-dry-run prints SQL)
gt-collect --write-d1 queue --d1-dry-run
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
| `relevance.py`, `data/relevance.yaml` | İlgi süzgeci: bölge ve konu tabloları, puan, eşik / relevance filter: region and topic tables, score, threshold |
| `d1.py` | Sinyal deposu: satır eşlemesi, partiler, `ON CONFLICT DO NOTHING`, wrangler yürütücüsü / signal store: row mapping, batching, `ON CONFLICT DO NOTHING`, the wrangler executor |
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
- `geo.region` in queue mode is the relevance filter's guess from the item's own title and excerpt, falling back to the feed's configured region. Only `geo` changes, so `content_hash`, `simhash` and the dedup id are unaffected.
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
