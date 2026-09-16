# apps/scheduler

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: kod yazıldı ve testleri geçiyor; **henüz dağıtılmadı** ve toplayıcı tetikleyicisi hâlâ GitHub Actions `schedule:` üzerindedir ([ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md)).
> Status: written and passing its tests; **not deployed yet**, and the collector trigger is still GitHub Actions' `schedule:` ([ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md)).

## Türkçe

`scheduler`, Cron Trigger ile çalışan bir Cloudflare Worker'ıdır. Her tetiklemede GitHub REST API'si üzerinden bu depodaki [`collect.yml`](../../.github/workflows/collect.yml) iş akışını `workflow_dispatch` ile başlatır. Başka hiçbir şey yapmaz: veri okumaz, veri yazmaz, hiçbir şey yayımlamaz.

Neden Worker: herkese açık depolarda `schedule:` ile çalışan iş akışları, depoda 60 gün etkinlik olmazsa GitHub tarafından devre dışı bırakılır ve yoğun saatlerde gecikir ([ADR 0008](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0008-zero-budget-infrastructure.md)). Cloudflare cron'u böyle bir kurala tabi değildir.

- **Sır yoksa hiçbir şey yapmaz.** `GITHUB_DISPATCH_TOKEN` yoksa veya boşsa Worker `console.error` ile yüksek sesle hata yazar ve döner; kimliksiz (anonim) çağrı **asla** denenmez.
- **Tetikleme başına en fazla bir istek.** GitHub hata döndürürse durum kodu günlüğe yazılır; yeniden deneme yoktur, sıradaki cron tetiklemesi tekrar dener.
- **Yazan uç nokta yok.** `fetch` işleyicisi yalnızca durum JSON'u döndürür; sır içermez, toplanan veri içermez. Çalıştırmayı yalnızca cron başlatabilir.

## English

`scheduler` is a Cloudflare Worker running on a Cron Trigger. On each tick it starts the [`collect.yml`](../../.github/workflows/collect.yml) workflow in this repository through the GitHub REST API with `workflow_dispatch`. It does nothing else: it reads no data, writes no data and publishes nothing.

Why a Worker: workflows on `schedule:` in a public repository are disabled by GitHub after 60 days without repository activity, and they run late at busy times ([ADR 0008](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0008-zero-budget-infrastructure.md)). Cloudflare's cron has no such rule.

- **No secret, no dispatch.** When `GITHUB_DISPATCH_TOKEN` is missing or empty, the Worker writes a loud `console.error` and returns. An unauthenticated call is **never** attempted as a fallback.
- **At most one request per tick.** A GitHub error is logged with its status code; there is no retry, the next cron tick tries again.
- **No write endpoint.** The `fetch` handler only returns status JSON, with no secret and no collected data in it. Only the cron tick can start a run.

---

## Teknik başvuru / Technical reference

### Cron

| İfade / Expression | Görev / Job |
|---|---|
| `23 5 * * *` | `collect.yml` çalıştırmasını tetikle / dispatch the `collect.yml` run |

05:23 UTC, bugün [`collect.yml`](../../.github/workflows/collect.yml) içindeki `schedule:` ile **aynı dakikadır**: tetikleyici Worker'a taşındığında koşunun *ne zaman* başladığı değil, *kimin* başlattığı değişir. Saat başları Actions kuyruğunun en uzun olduğu andır, bu yüzden dakika kaydırılmıştır. Ücretsiz plan az sayıda cron tetikleyicisine izin verir (bu satır yazılırken 5); burada **bir** tanesi kullanılır, kalanı `api`, `review-bot` ve `publisher` içindir.

05:23 UTC is **the same minute** as the `schedule:` in [`collect.yml`](../../.github/workflows/collect.yml) today: moving the trigger to the Worker changes *who* starts the run, not *when*. The minute is off the hour because Actions queues are longest on the hour. The free plan allows a small number of cron triggers (5 as this is written); this Worker uses **one**, leaving the rest for `api`, `review-bot` and `publisher`.

### Tetikleme / Dispatch

```text
POST https://api.github.com/repos/Greater-Turkiye/platform/actions/workflows/collect.yml/dispatches
Authorization: Bearer <GITHUB_DISPATCH_TOKEN>
{"ref": "main", "inputs": {"max_items": "40"}}
```

Gönderilen girdiler yalnızca `collect.yml`'nin tanımladığı girdilerdir; GitHub tanımadığı bir girdiye 422 döner. `dry_run` yalnızca `DRY_RUN` değişkeni `"true"` iken ve `true` olarak gönderilir, böylece iş akışının kendi varsayılanı geçerli kalır.
Only the inputs `collect.yml` declares are sent; GitHub answers 422 to an unknown one. `dry_run` is sent only when the `DRY_RUN` var is `"true"`, so the workflow's own default stays in charge otherwise.

### Değişkenler ve sır / Vars and secret

| Ad / Name | Tür / Kind | Varsayılan / Default | Açıklama / Description |
|---|---|---|---|
| `TARGET_REPOSITORY` | var | `Greater-Turkiye/platform` | Tetiklenen depo / the repository dispatched |
| `TARGET_WORKFLOW` | var | `collect.yml` | İş akışı dosyası / the workflow file |
| `TARGET_REF` | var | `main` | Çalıştırılacak dal / the ref the run uses |
| `MAX_ITEMS` | var | `40` | `max_items` girdisi / the `max_items` input |
| `DRY_RUN` | var | `false` | `"true"` ise konu açılmaz, defter yazılmaz / when `"true"`, no issue and no ledger commit |
| `GITHUB_DISPATCH_TOKEN` | **sır / secret** | — | Dağıtımdan sonra `wrangler secret put` ile eklenir / added with `wrangler secret put` after deploy |

**Token kapsamı / Token scope (en az yetki / least privilege).** İnce ayarlı (fine-grained) bir kişisel erişim token'ı:

- Resource owner: `Greater-Turkiye`
- Repository access: **Only select repositories → `Greater-Turkiye/platform`** (tek depo / that one repository)
- Repository permissions: **Actions: Read and write** — başka hiçbir izin yok / no other permission
- Account permissions: yok / none
- Sona erme: en fazla 90 gün, takvime yazılır ve döndürülür / expiry at most 90 days, diarised and rotated

`Actions: write`, `workflow_dispatch` çağrısının gerektirdiği tek izindir; bu token ile kod itmek, konu açmak veya sır okumak mümkün değildir. Organizasyon, ince ayarlı token'lar için onay isteyebilir; bir yönetici token'ı onaylamalıdır. Token yalnızca Cloudflare sır deposunda durur, depoda hiçbir yerde bulunmaz.

`Actions: write` is the only permission the `workflow_dispatch` call needs; the token cannot push code, open issues or read secrets. The organisation may require approval for fine-grained tokens, so an owner has to approve it. The token lives only in Cloudflare's secret store, never anywhere in this repository.

### Sır yokken ne olur / What happens without the secret

```text
scheduler: GITHUB_DISPATCH_TOKEN is missing or empty — no dispatch.
Set it with: wrangler secret put GITHUB_DISPATCH_TOKEN
```

`wrangler tail` veya Workers Logs'ta görünür; tetikleme atlanır, ağ isteği yapılmaz, toplayıcı çalışmaz. Bu, sessizce kimliksiz çağrı denemekten (her zaman 401/404 döner) ve bozuk hattı günlerce gizlemekten kasıtlı olarak daha gürültülüdür.
Visible in `wrangler tail` or Workers Logs; the tick is skipped, no network request is made and the collector does not run. This is deliberately louder than quietly trying an unauthenticated call (which always fails with 401/404) and hiding a broken pipeline for days.

### Yerelde / Locally

```powershell
cd apps/scheduler
npm ci
npm test                  # vitest + @cloudflare/vitest-pool-workers, workerd içinde / inside workerd
npx wrangler deploy --dry-run   # yalnızca derleme ve yapılandırma denetimi / build and config check only
npm run dev               # durum uç noktası: http://localhost:8787/health
```

Testler kimlik bilgisi istemez ve ağa çıkmaz; `fetch` testlerde enjekte edilir.
The tests need no credentials and do not touch the network; `fetch` is injected in the tests.

### Dağıtım / Deploy

Dağıtım bir bakımcının elle yaptığı iştir; CI dağıtmaz. / Deploying is a maintainer's manual step; CI never deploys.

```powershell
cd apps/scheduler
npm ci
npx wrangler deploy
npx wrangler secret put GITHUB_DISPATCH_TOKEN   # token yapıştırılır / paste the token
npx wrangler tail gt-scheduler                  # ilk tetiklemeyi izle / watch the first tick
```

Doğrulama için `DRY_RUN` değişkeni geçici olarak `"true"` yapılabilir: koşu başlar ama konu açmaz ve defter yazmaz.
To verify, `DRY_RUN` can be set to `"true"` for a while: the run starts but opens no issue and writes no ledger commit.

### Tetikleyiciyi taşımak / Switching the trigger over

Bu adımlar bu PR'ın **kapsamı dışındadır** ve Worker dağıtılmadan yapılmaz:

These steps are **out of scope for this pull request** and are not done before the Worker is deployed:

1. Worker'ı dağıt, sırrı ekle ve en az bir başarılı tetikleme gör (`wrangler tail`).
   Deploy the Worker, add the secret, and see at least one successful dispatch.
2. [ADR 0016](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0016-collector-schedule-until-worker.md)'yı geçersiz kılan yeni bir ADR yaz: tetikleyici Worker'a döner.
   Write a new handbook ADR superseding ADR 0016: the trigger returns to the Worker.
3. Ayrı bir PR'da `collect.yml` içindeki `schedule:` bloğunu kaldır (`workflow_dispatch` kalır) ve `README.md` ile `ARCHITECTURE.md`'yi güncelle.
   In a separate pull request, remove the `schedule:` block from `collect.yml` (keeping `workflow_dispatch`) and update `README.md` and `ARCHITECTURE.md`.
4. İki tetikleyici aynı anda açık bırakılmaz: aynı dakikada iki koşu demektir (`concurrency: collect` bunları sıraya alır, ama defter iki kez yazılır).
   The two triggers are never left on at the same time: that means two runs in the same minute (`concurrency: collect` queues them, but the ledger is written twice).

### Geri alma / Rolling back to `schedule:`

1. `wrangler.jsonc` içindeki `triggers.crons` dizisini boşaltıp (`[]`) yeniden dağıt, ya da Worker'ı tamamen sil (`npx wrangler delete gt-scheduler`).
   Empty the `triggers.crons` array (`[]`) in `wrangler.jsonc` and redeploy, or delete the Worker entirely (`npx wrangler delete gt-scheduler`).
2. `collect.yml` içindeki `schedule:` bloğunu geri koy (bu PR'dan sonra hâlâ oradaysa hiçbir şey yapmaya gerek yok) ve Actions → collect → Run workflow ile bir kez elle tetikleyerek cron'u yeniden kur.
   Put the `schedule:` block back in `collect.yml` (if it is still there, nothing to do) and re-arm the cron with one manual Actions → collect → Run workflow.
3. Token'ı iptal et: GitHub → Settings → Developer settings → fine-grained tokens.
   Revoke the token: GitHub → Settings → Developer settings → fine-grained tokens.

Sır sızıntısı şüphesinde sıra: önce token'ı iptal et, sonra yenisini `wrangler secret put` ile koy.
If the secret is suspected leaked, revoke the token first, then put a new one in with `wrangler secret put`.

### Henüz burada olmayanlar / Not here yet

Bu Worker, [ARCHITECTURE.md](../../ARCHITECTURE.md)'deki tasarımın yalnızca tetikleyici parçasıdır. Tasarımın kalanı, ihtiyaç duyulduğunda ve ayrı kararlarla gelir:

This Worker is only the trigger part of the design in [ARCHITECTURE.md](../../ARCHITECTURE.md). The rest arrives when it is needed, through separate decisions:

- **GitHub App kurulum token'ı** yerine şimdilik ince ayarlı bir token: App tek bir `workflow_dispatch` için fazladan altyapıdır; `datasets` PR'ları için App zaten gerekli olduğunda bu Worker da ona geçebilir. / A fine-grained token instead of a **GitHub App installation token** for now; the Worker can move to the App when one exists for the `datasets` pull requests.
- **D1 bağlamaları yok** (`collector_state`, `usage_ledger`): sıklık 15 dakikaya çıkıp toplayıcılar tek tek zamanlandığında gerekir. / **No D1 bindings** yet; they are needed when the cadence goes to 15 minutes and collectors are scheduled one by one.
- **KV `collect:paused` anahtarı yok**: acil durdurma `triggers.crons` boşaltılarak yapılır. / **No KV `collect:paused` key**; the stop switch is emptying `triggers.crons`.
- **Günlük bakım tetikleyicisi yok** (saklama silmeleri): veritabanı bağlamaları gelince eklenir. / **No daily maintenance trigger**; it comes with the database bindings.
