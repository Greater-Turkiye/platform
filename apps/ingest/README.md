# apps/ingest

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: **dağıtıldı ve çalışıyor** (`gt-ingest`, 2026-09-17). Cron günde iki kez tetikler; son çalışma 2026-09-19'da başarıyla tamamlandı ve o günün partisini işledi. Hiçbir sır kullanmaz.
> Status: **deployed and running** (`gt-ingest`, since 2026-09-17). The cron fires twice a day; the last run completed successfully on 2026-09-19 and processed that day's batch. It uses no secret.

## Türkçe

`ingest`, Cron Trigger ile çalışan bir Cloudflare Worker'ıdır. Her tetiklemede toplayıcı çalışmasının **yayımladığı partiyi** depodan okur ve D1'e yazar: sinyalleri `gt-signals`, insana sunulmuş adayları `gt-ops.reviews` inceleme kuyruğuna.

**Neden çekiyor, kendisine gönderilmiyor?** GitHub Actions'tan D1'e yazmak `CLOUDFLARE_API_TOKEN` deposu secret'ı ister: bir insanın oluşturup saklayacağı ve döndüreceği, Cloudflare dışında yaşayan bir kimlik bilgisi. Bu Worker ise veritabanlarının sahibi olan Cloudflare hesabının **içinde** çalışır; yazma yetkisi D1 bağlamalarının kendisidir. Toplayıcı çalışması partisini herkese açık bir depodaki `collector-state` dalına yayımlar, Worker onu herkese açık HTTPS üzerinden okur ve el değiştirmenin iki ucunda da hiçbir sır bulunmaz.

- **Sır yok.** Ne kodda, ne yapılandırmada, ne testlerde, ne CI'da. `wrangler secret put` bu Worker'ın dağıtımının parçası değildir.
- **Yazan uç nokta yok.** `fetch` işleyicisi yalnızca durum JSON'u döndürür: veri yok, sır yok. Yazabilen tek şey cron tetiklemesidir ve yalnızca deponun yayımladığını yazabilir.
- **Okuduğu dosya güvenilmezdir.** Her satır `signals` şemasına göre alan alan denetlenir, satır sayısı sınırlanır, uymayan dosya **tamamen** reddedilir — yarısı veritabanına girmez.
- **Yeniden çalıştırma zararsızdır.** İşlenen parti `ops.collector_state.cursor` içine yazılır; ayrıca her iki ekleme de `ON CONFLICT DO NOTHING`'dir, yani imleç kaybolsa bile aynı parti ikinci kez hiçbir satır yazmaz ve verilmiş bir kararı geri almaz.

## English

`ingest` is a Cloudflare Worker running on a Cron Trigger. On each tick it reads the batch the collector run **published** to the repository and writes it into D1: the signals into `gt-signals`, the candidates a human was offered into the `gt-ops.reviews` queue.

**Why it pulls instead of being pushed to.** Writing to D1 from GitHub Actions needs a `CLOUDFLARE_API_TOKEN` repository secret: a credential a human has to create, store and rotate, living outside Cloudflare. This Worker runs *inside* the account that owns both databases, so its D1 bindings are its authorisation. The collector run publishes its batch to the `collector-state` branch of a public repository, this Worker reads it over public HTTPS, and no secret exists on either side of the hand-off.

- **No secret.** Not in the code, the configuration, the tests or CI. `wrangler secret put` is not part of deploying this Worker.
- **No write endpoint.** The `fetch` handler returns status JSON only: no data, no secret. The cron tick is the only thing that writes, and it can only write what the repository published.
- **The file it reads is untrusted.** Every row is checked field by field against the `signals` schema, the row count is capped, and a file that does not match is refused **whole** rather than half-inserted.
- **Re-running is harmless.** The batch it processed is recorded in `ops.collector_state.cursor`, and both inserts are `ON CONFLICT DO NOTHING`, so even with the cursor lost the same batch writes no row the second time and undoes no decision.

---

## Teknik başvuru / Technical reference

### Akış / Flow

```text
cron tick
  GET  …/collector-state/collectors/state/batches/latest.json       (pointer, ≤4 KiB)
  SELECT cursor FROM ops.collector_state WHERE collector_id='gt-ingest'
  ├─ cursor == pointer.batch_id  → nothing to do
  GET  …/collector-state/collectors/state/batches/<batch_id>.json   (≤4 MB, ≤1000 rows)
  sha256(file) == pointer.sha256 ?
  validate every row against the signals schema
  INSERT INTO signals  … ON CONFLICT(content_hash) DO NOTHING     (25 rows per statement)
  INSERT INTO reviews  … ON CONFLICT(content_hash) DO NOTHING     (only triage_status='queued')
  UPSERT ops.collector_state  (cursor = batch_id, last_success_at, consecutive_failures = 0)
```

Sıra önemlidir: önce `signals`, sonra `reviews` — sinyali olmayan bir inceleme satırı, botta kaynak bağlantısı olmayan bir aday olarak görünür. / Order matters: signals first, reviews second, because a review without its signal renders in the bot as a candidate with no source link.

### Cron

| İfade / Expression | Görev / Job |
|---|---|
| `53 5,17 * * *` | Yayımlanmış en yeni partiyi çek / pull the newest published batch |

Toplama 05:23 UTC'de başlar ve en çok 20 dakika sürer, bu yüzden 05:53 partiyi hazır bulur. 17:53 tetiklemesi normalde bir okuma artı bir D1 sorgusudur; işi, kötü geçen bir sabahı kayıp bir güne değil bir yeniden denemeye çevirmektir. Tek bir cron ifadesi, ücretsiz planın izin verdiği az sayıdaki tetikleyiciden **birini** kullanır (`scheduler` bir diğerini).

The collection run starts at 05:23 UTC and is capped at 20 minutes, so 05:53 finds the batch published. The 17:53 tick is normally one small fetch and one D1 read; its job is to turn a bad morning into a retry rather than a lost day. One cron expression uses **one** of the few triggers the free plan allows (`scheduler` uses another).

### Ne okur / What it reads

Yayımlanan iki dosya [`collectors/state/batches/`](../../collectors/state/README.md) altında, `collector-state` dalındadır; biçimi [`collectors/src/gt_collectors/batch.py`](../../collectors/src/gt_collectors/batch.py) tanımlar. / The two published files live under `collectors/state/batches/` on the `collector-state` branch; the format is defined by `collectors/src/gt_collectors/batch.py`.

```jsonc
// latest.json — the pointer
{"schema":"gt.collector.batch-pointer/1","batch_id":"2026-09-16-18234567890",
 "file":"2026-09-16-18234567890.json","sha256":"…64 hex…","rows":37,
 "created_at":"2026-09-16T05:23:11Z"}

// 2026-09-16-18234567890.json — the batch
{"schema":"gt.collector.batch/1","batch_id":"2026-09-16-18234567890",
 "created_at":"2026-09-16T05:23:11Z","run_url":"https://github.com/…",
 "counts":{"rows":37,"reviews":12,"truncated":0,
           "by_triage_status":{"pending":5,"queued":12,"scored":20}},
 "rows":[ /* one signals row each: the 16 columns, nothing else */ ]}
```

`file` **yalnızca bir addır**, hiçbir zaman URL veya yol değildir: `BATCH_BASE_URL` ile birleştirilmeden önce sıkı bir desene ve `batch_id`'ye uydurulur, istek `redirect: "error"` ile yapılır. Böylece dosyanın içeriği Worker'ı başka bir adrese gönderemez. / `file` is **only a name**, never a URL or a path: it is matched against a strict pattern and tied to `batch_id` before it is joined to `BATCH_BASE_URL`, and the request refuses redirects, so nothing inside a file can send the Worker somewhere else.

### Neyi reddeder / What it refuses

| | |
|---|---|
| JSON olmayan, nesne olmayan, tanımadığı `schema` / not JSON, not an object, an unknown `schema` | tamamı reddedilir / the whole file |
| İşaretçi ile eşleşmeyen `batch_id`, satır sayısı veya SHA-256 / a `batch_id`, row count or SHA-256 that does not match the pointer | tamamı / the whole file |
| URL, yol veya `batch_id`'ye uymayan `file` / a `file` that is a URL, a path, or does not match `batch_id` | tamamı / the whole file |
| Tam 16 `signals` sütunu olmayan satır — eksik **veya fazla** / a row without exactly the 16 `signals` columns, missing **or extra** | tamamı / the whole file |
| Şemaya uymayan alan: `content_hash`, `raw_hash`, `source_id`, `collector_id`, `url`, `lang`, `region`, zaman damgaları, `geo_json`/`triage_labels` JSON'u, `title` ≤300, `text` ≤1000, `triage_score` 0–1 / any field that does not match the schema | tamamı / the whole file |
| `triage_status` ∈ {`queued`,`pending`,`scored`} dışında — şema beşine izin verse de `duplicate` ve `dropped` triyaj işinindir / outside the three a collector produces | tamamı / the whole file |
| 16 onaltılık karakter olmayan `simhash` / a `simhash` that is not 16 hex characters | tamamı / the whole file |
| NUL baytı içeren metin, geçersiz UTF-8 / text with a NUL byte, invalid UTF-8 | tamamı / the whole file |
| `MAX_ROWS_PER_TICK`'ten çok satır, `WRITE_BUDGET`'ten pahalı parti, 4 MB'tan büyük dosya / more rows, more writes or more bytes than one tick allows | tamamı / the whole file |

Reddetme **hep ya hep yok**'tur: geçerli satırlar da yazılmaz. Sebep `ops.collector_state.last_error`'a yazılır ve `consecutive_failures` artar; imleç ilerlemez. Ertesi çalışma yeni bir parti ve yeni bir işaretçi yayımladığı için bozuk bir dosya kendiliğinden bir gün içinde düzelir. Hata metni yalnızca satır numarası ve alan adı içerir, **hiçbir zaman değerin kendisini** — çünkü bu metin saklanır ve günlüğe yazılır.

A refusal is **all or nothing**: the valid rows are not written either. The reason goes into `ops.collector_state.last_error` and `consecutive_failures` goes up; the cursor does not move. The next run publishes a new batch and a new pointer, so a broken file heals itself within a day. A refusal names the row index and the field and **never the value**, because that text is stored and read in logs.

### Kırmızı çizgi / The red line

Güvenlik süzgecinin veya coğrafi çitin elediği hiçbir kayıt yayımlanan dosyada yoktur: çalışma, partiyi yazmadan önce süzgeci yeniden uygular ([`batch.py`](../../collectors/src/gt_collectors/batch.py) → `d1.prepare`). Bu Worker orada olmayanı geri getiremez. Bunu iki tarafta da test eder: `collectors/tests/test_batch.py` ve `apps/ingest/test/contract.test.js`.

Nothing the safety filter or the geofence dropped is in the published file: the run applies the filter again before writing the batch, and this Worker cannot put back what is not there. Both sides test it — `collectors/tests/test_batch.py` and `apps/ingest/test/contract.test.js`, the latter against a batch the Python publisher really wrote.

### Değişkenler / Vars (hepsi herkese açık / all public)

| Ad / Name | Varsayılan / Default | Açıklama / Description |
|---|---|---|
| `BATCH_BASE_URL` | `https://raw.githubusercontent.com/Greater-Turkiye/platform/collector-state/collectors/state/batches/` | `https://` ile başlamalı ve `/` ile bitmeli / must be https and end in `/` |
| `MAX_ROWS_PER_TICK` | `1000` | Bir tetiklemede en çok satır / most rows in one tick |
| `INSERT_BATCH` | `25` | `INSERT` başına satır / rows per statement |
| `WRITE_BUDGET` | `20000` | Bir tetiklemede yazılabilecek satır (dizinler dâhil; günlük ücretsiz sınır 100.000) / rows this tick may write, index entries included |

**Sır / Secrets: yok / none.**

### Bağlamalar / Bindings

| Ad / Name | Tür / Type | Kullanım / Use |
|---|---|---|
| `SIGNALS_DB` | D1 `gt-signals` | `signals` |
| `OPS_DB` | D1 `gt-ops` | `reviews`, `collector_state` |

### Yazma bütçesi / Write budget

`db/README.md`: bir ekleme ≈ 3 yazma (satır + iki dizin girdisi), kopya ekleme 0. En kötü durumda bir tetikleme 1.000 sinyal + 1.000 inceleme = ~6.000 yazma, yani günlük 100.000'lik ücretsiz sınırın %6'sı. Gerçek bir çalışma bunun onda biri kadardır. `collector_state` `WITHOUT ROWID`'dir: imleç güncellemesi tek satır yazar.

An insert costs about three rows written (the row plus two index entries) and a duplicate insert costs nothing. A worst-case tick is 1,000 signals plus 1,000 reviews ≈ 6,000 writes, 6% of the free plan's 100,000 a day; a real run is a tenth of that. `collector_state` is `WITHOUT ROWID`, so moving the cursor costs one row write.

### Yerelde / Locally

```powershell
cd apps/ingest
npm ci
npm test                        # vitest + @cloudflare/vitest-pool-workers, workerd içinde / inside workerd
npx wrangler deploy --dry-run   # yalnızca derleme ve yapılandırma denetimi / build and config check only
npm run dev                     # durum uç noktası / status endpoint: http://localhost:8787/health
```

Testler kimlik bilgisi istemez ve ağa çıkmaz: iki D1 veritabanı `db/migrations`'tan yerel olarak kurulur (bu yüzden şemayı gerçekten sınar) ve `fetch` enjekte edilir.
The tests need no credentials and do not touch the network: both D1 databases are built locally from `db/migrations`, so the schema really is under test, and `fetch` is injected.

### Dağıtım / Deploy

```powershell
cd apps/ingest
npm ci
npx wrangler deploy          # hepsi bu / that is all
npx wrangler tail gt-ingest  # ilk tetiklemeyi izle / watch the first tick
```

**Eklenecek sır yoktur.** Worker'ın yazma yetkisi `wrangler.jsonc` içindeki D1 bağlamalarıdır; onlar da hesap yetkisiyle çalışır. Birden çok Cloudflare hesabı görünüyorsa `wrangler` çağrılarından önce `CLOUDFLARE_ACCOUNT_ID` ortam değişkenini ayarlayın (sır değildir, hesap kimliğidir).

**There is no secret to add.** The Worker's authorisation to write is the D1 bindings in `wrangler.jsonc`, which work through account permissions. If more than one Cloudflare account is visible, set the `CLOUDFLARE_ACCOUNT_ID` environment variable before the `wrangler` calls (not a secret, just an account id).

İlk tetiklemeden sonra doğrulama / verifying after the first tick:

```bash
npx wrangler d1 execute gt-ops --remote \
  --command "SELECT cursor, last_run_at, consecutive_failures, last_error FROM collector_state WHERE collector_id='gt-ingest'"
npx wrangler d1 execute gt-signals --remote --command "SELECT COUNT(*) FROM signals"
```

### Durdurma ve geri alma / Pausing and rolling back

1. Durdurmak: `wrangler.jsonc` içindeki `triggers.crons` dizisini boşaltıp (`[]`) yeniden dağıtın, ya da `npx wrangler delete gt-ingest`. Yayımlanan partiler dalda kalır; Worker geri geldiğinde en yenisini alır (eskileri değil — işaretçi tektir). / To pause: empty `triggers.crons` and redeploy, or delete the Worker. The published batches stay on the branch; when the Worker returns it takes the newest one (not the older ones — there is one pointer).
2. Bir partiyi yeniden işlemek: `UPDATE collector_state SET cursor = NULL WHERE collector_id = 'gt-ingest'`. `ON CONFLICT DO NOTHING` sayesinde zararsızdır. / To reprocess a batch: clear the cursor; `ON CONFLICT DO NOTHING` makes it harmless.
3. Eski yola dönmek: depoya `CLOUDFLARE_API_TOKEN` secret'ı ekleyin — `collect.yml`'deki son adım kendiliğinden yeniden çalışır. İki yol aynı anda açık olabilir; aynı satırları yazarlar ve ikisi de idempotenttir. / To go back to the push path: add a `CLOUDFLARE_API_TOKEN` secret and the last step of `collect.yml` starts working again. Both paths may run at once: they write the same rows and both are idempotent.

### Henüz burada olmayanlar / Not here yet

- **Saklama silmeleri yok** (90 gün, `db/README.md`): ayrı bir bakım tetikleyicisi işidir. / **No retention deletes**; that belongs to a separate maintenance trigger.
- **Birden çok parti yakalama yok**: bir tetikleme en fazla bir parti alır. Worker günlerce kapalı kalırsa yalnızca en yeni parti işlenir; aradakiler dalda durur ve elle işlenebilir. / **No catch-up**: one tick takes at most one batch. If the Worker is off for days only the newest batch is processed; the others stay on the branch.
- **`apps/api` ile ilgisi yok**: `api`, HMAC imzalı `POST /v1/ingest` uç noktasıyla tasarlanmış herkese açık kapıdır ([apps/api/README.md](../api/README.md)). Bu Worker'ın herkese açık yazma ucu yoktur ve kendi cron'uyla çalışır; ikisini birleştirmek, sır isteyen bir Worker'a sır istemeyen bir yolu bağlamak olurdu. / **Separate from `apps/api`**, which is designed as the public front door with an HMAC `POST /v1/ingest`. This Worker has no public write endpoint and runs on its own cron; merging them would attach a credential-free path to a Worker that needs credentials.
