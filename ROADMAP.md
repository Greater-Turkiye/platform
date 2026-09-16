# Yol Haritası / Roadmap

[Türkçe](#türkçe) · [English](#english) · [Aşamalar / Phases](#aşamalar--phases)

## Türkçe

Aşamalar sırayla ilerler; bir aşama tamamlanmadan sonraki aşamanın yayın yapan parçaları devreye alınmaz. **(good first issue)** ile işaretli görevler yeni katkıcılar için uygundur. Görev listesi iki dilde tek bir liste olarak tutulur, böylece durum işaretleri tek yerde güncellenir. Mimari: [ARCHITECTURE.md](ARCHITECTURE.md).

## English

Phases proceed in order; publishing parts of a phase are not switched on before the previous phase is complete. Tasks marked **(good first issue)** are suitable for new contributors. The task list is kept as a single bilingual list so that status marks are updated in one place. Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Aşamalar / Phases

### Aşama 1 — Çekirdek / Phase 1 — Core (neredeyse tamam / nearly done)

- [x] GitHub organizasyonu — GitHub org
- [x] Ekipler (`maintainers`, `reviewers`, `triagers`), org güvenlik varsayılanları, dal kuralları — Teams, org security defaults, branch rulesets
- [ ] Zorunlu 2FA (web arayüzü) — Mandatory 2FA (web UI)
- [x] Depolar: `.github`, `handbook`, `datasets`, `platform`, `internal` — Repositories
- [x] JSON şemaları (`schemas/v1`) ve sözlükler — JSON Schemas and vocabularies
- [x] Doğrulayıcı `tools/gt.py` (`validate`, `build`, `new`, `id`) — Validator
- [x] El kitabı (tr/en) ve ADR 0001–0012 — Handbook (tr/en) and ADRs 0001–0012
- [x] Issue formları, PR şablonu, topluluk dosyaları — Issue forms, PR template, community files
- [x] Platform iskeleti ve mimari belgeler — Platform skeleton and architecture docs

### Aşama 2 — İlk toplayıcılar / Phase 2 — First collectors

- [x] D1 şeması: `db/migrations/ops/0001_init.sql`, `db/migrations/signals/0001_init.sql` — D1 schema
- [x] Toplayıcı çatısı: `uv` projesi, sinyal modeli, HMAC istemcisi — Collector framework: `uv` project, signal model, HMAC client
- [x] Türk kuvvetleri güvenlik filtresi ve testleri (ICAO bloğu, MMSI MID, geofence) — Turkish-forces safety filter and tests
- [x] Güvenlik filtresi için test örnekleri (sentetik veri) **(good first issue)** — Test fixtures for the safety filter (synthetic data)
- [x] RSS toplayıcı — RSS collector
- [x] RSS kaynak listesi: resmî bakanlık/hükümet akışlarını bulup koşullarını not etmek **(good first issue)** — RSS source list: find official feeds and note their terms ([collectors/sources.md](collectors/sources.md); bölge devletlerinin koşulları bakımcı onayı bekliyor, BM akışları kuyrukta / regional states' terms await maintainer confirmation, the UN feeds are in the queue)
- [x] Zamanlanmış toplama işi: `schedule:` + `workflow_dispatch`, tekilleştirme defteri (`collector-state` dalı), yapıt — Scheduled collection job with a dedup ledger and an artifact ([.github/workflows/collect.yml](.github/workflows/collect.yml))
- [x] İnsan inceleme kuyruğu: çalışma başına tek konu, `inceleme-kuyrugu` etiketi, doğrulanmamış adaylar — Human review queue: one issue per run, unverified candidates only
- [x] Toplanan sinyalleri `gt-signals` D1 veritabanına yazma: konudan sonra, `INSERT … ON CONFLICT DO NOTHING`, tek sır `CLOUDFLARE_API_TOKEN` — Write collected signals into the `gt-signals` D1 database (after the issue, idempotent, one optional secret)
- [x] İnceleme kuyruğunu doldurma: insana sunulan adaylar `gt-ops.reviews` satırı olur; inceleme botunun kuyruğu artık boş değil — Fill the review queue: the candidates offered to a human become `gt-ops.reviews` rows, so the review bot's queue is no longer empty
- [ ] NASA FIRMS toplayıcı — NASA FIRMS collector
- [ ] `api` Worker: `/v1/ingest` (HMAC, parti ≤100, `content_hash` tekilleştirme) — ingest endpoint
- [ ] `scheduler` Worker: cron → `workflow_dispatch` — kod ve testler hazır ([apps/scheduler](apps/scheduler)), **dağıtım ve tetikleyicinin taşınması bekliyor** (günlük `schedule:` hâlâ yerine çalışıyor; 15 dakikalık sıklık D1 bağlamalarıyla gelecek) / scheduler Worker: written and tested, **awaiting deployment and the trigger switch** (the daily `schedule:` still stands in for it; the 15-minute cadence comes with the D1 bindings)
- [ ] GitHub App kaydı ve en az yetkili kurulumlar — GitHub App registration and least-privilege installations
- [x] CI: lint, test, SHA'ya sabitlenmiş Actions, Dependabot — CI: lint, tests, SHA-pinned Actions, Dependabot (`collectors-ci.yml`, `.github/dependabot.yml`)
- [ ] Belgelerdeki kırık bağlantıları denetleyen iş akışı **(good first issue)** — Workflow that checks docs for broken links

### Aşama 3 — İnceleme / Phase 3 — Review

- [x] `review-bot` Worker: Telegram webhook, gizli token doğrulaması, sohbet + kullanıcı izin listesi, testler ([apps/review-bot](apps/review-bot); **dağıtılmadı**, bot hesabı ve sırlar bir insanı bekliyor) — Telegram webhook, secret token check, chat + user allowlist, tests (not deployed; the bot account and the secrets are a human step)
- [x] `onayla` / `reddet` / `sonra` ve kararın `gt-ops.reviews`'a gözden geçirici + zaman damgasıyla yazılması — Approve / dismiss / skip, written to `gt-ops.reviews` with the reviewer and a timestamp
- [ ] Bülten gönderme işlemi (yayın kuyruğu geldiğinde) — Send as bulletin (once the publish queue exists)
- [ ] Taslaktan `datasets` PR'ı (GitHub App) — bugün onay yalnızca `status = 'drafted'` işaretidir, PR'ı insan açar; dikiş: `onApproved` — Draft → `datasets` PR via GitHub App; today approval is only the `drafted` mark and a human opens the PR (seam: `onApproved`)
- [ ] Anahtar sözcük triyaj kuralları — Keyword triage rules
- [ ] Dil başına anahtar sözcük listeleri (ar, el, fa, ru, hy, az, ...) **(good first issue)** — Per-language keyword lists
- [ ] Özel bildirim formu (`/v1/intake`, Turnstile, IP kaydı yok) — Private intake form (Turnstile, no IP logging)
- [ ] Bot mesaj metinlerinin Türkçe/İngilizce gözden geçirilmesi **(good first issue)** — Review of bot message texts in TR/EN

### Aşama 4 — Yayıncılar / Phase 4 — Publishers

- [x] Yayıncı iskeleti: mesaj sözleşmesi, içerik denetimleri, kanal tanımları, taslak üretimi — Publisher skeleton: message contract, content checks, channel definitions, draft rendering ([publishers](publishers); hiçbir şey göndermez / it cannot post)
- [x] İnsan onayı kapısı ve acil durdurma (`PUBLISH_PAUSED`) — Human-approval gate and kill switch
- [x] Hız sınırları (saatte ≤4, günde ≤30) — Rate limits, as pure functions with tests
- [x] Gönderi şablonları için testler **(good first issue)** — Tests for the post templates (`publishers/tests`)
- [x] RSS / JSON Feed: hesap gerektirmeyen kamu akışı — Account-free public feed (`feed.xml`, `feed.json`, `feed.md`, built in [datasets](https://github.com/Greater-Turkiye/datasets))
- [ ] Yayın kuyruğu ve `publisher` Worker — Publish queue and publisher Worker
- [ ] Telegram (TR): bot hesabı + sırlar (insan) ve istemciyi ekleyen PR — Telegram (TR): bot account + secrets (human) and the pull request that adds the client
- [ ] Bluesky (EN): hesap + uygulama parolası (insan) ve AT Protocol istemcisi — Bluesky (EN): account + app password (human) and the AT Protocol client
- [ ] Bülten rölesinin akışa yazması — The bulletin relay writing into the feed
- [ ] Otomatik düzeltme gönderileri — Automatic correction posts
- [ ] X ve Instagram için elle paylaşıma hazır metin — Copy-ready text for manual X and Instagram posting

### Aşama 5 — Web / Phase 5 — Web

- [ ] `datasets` sürümlerinden statik site — Static site from `datasets` releases
- [ ] Kayıt sayfaları ve arama — Record pages and search
- [ ] Haritalar (açık lisanslı altlık, harici izleyici yok) — Maps (openly licensed basemap, no third-party trackers)
- [ ] Erişilebilirlik ve mobil denetimi **(good first issue)** — Accessibility and mobile review
- [ ] Zenodo entegrasyonu ile sürümlere DOI — Zenodo DOIs for releases
- [ ] Cloudflare Access arkasında yönetim arayüzü — Admin UI behind Cloudflare Access

### Aşama 6 — Dil modeli destekli triyaj / Phase 6 — LLM-assisted triage

- [ ] GitHub Models ile şemaya bağlı sınıflandırma — Schema-bound classification with GitHub Models
- [ ] Workers AI yedeği — Workers AI fallback
- [ ] Kota defteri ve kota bitince insan kuyruğuna düşme — Quota ledger and fallback to the human queue
- [ ] TR↔EN çeviri taslakları (insan onaylı) — TR↔EN translation drafts (human-approved)
- [ ] Değerlendirme kümesi: etiketli örnek sinyaller **(good first issue)** — Evaluation set: labelled example signals
