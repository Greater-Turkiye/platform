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

- [ ] D1 şeması: `db/migrations/ops/0001_init.sql`, `db/migrations/signals/0001_init.sql` — D1 schema
- [ ] Toplayıcı çatısı: `uv` projesi, sinyal modeli, HMAC istemcisi — Collector framework: `uv` project, signal model, HMAC client
- [ ] Türk kuvvetleri güvenlik filtresi ve testleri (ICAO bloğu, MMSI MID, geofence) — Turkish-forces safety filter and tests
- [ ] Güvenlik filtresi için test örnekleri (sentetik veri) **(good first issue)** — Test fixtures for the safety filter (synthetic data)
- [ ] RSS toplayıcı — RSS collector
- [ ] RSS kaynak listesi: resmî bakanlık/hükümet akışlarını bulup koşullarını not etmek **(good first issue)** — RSS source list: find official feeds and note their terms
- [ ] NASA FIRMS toplayıcı — NASA FIRMS collector
- [ ] `api` Worker: `/v1/ingest` (HMAC, parti ≤100, `content_hash` tekilleştirme) — ingest endpoint
- [ ] `scheduler` Worker: cron → `workflow_dispatch` — scheduler Worker
- [ ] GitHub App kaydı ve en az yetkili kurulumlar — GitHub App registration and least-privilege installations
- [ ] CI: lint, test, SHA'ya sabitlenmiş Actions, Dependabot — CI: lint, tests, SHA-pinned Actions, Dependabot
- [ ] Belgelerdeki kırık bağlantıları denetleyen iş akışı **(good first issue)** — Workflow that checks docs for broken links

### Aşama 3 — İnceleme / Phase 3 — Review

- [ ] `review-bot` Worker: Telegram webhook, gizli token doğrulaması, gözden geçirici izin listesi — Telegram webhook, secret token check, reviewer allowlist
- [ ] Reddet / taslağa yükselt / bülten gönder işlemleri — Dismiss / promote to draft / send as bulletin
- [ ] Taslaktan `datasets` PR'ı (GitHub App) — Draft → `datasets` PR via GitHub App
- [ ] Anahtar sözcük triyaj kuralları — Keyword triage rules
- [ ] Dil başına anahtar sözcük listeleri (ar, el, fa, ru, hy, az, ...) **(good first issue)** — Per-language keyword lists
- [ ] Özel bildirim formu (`/v1/intake`, Turnstile, IP kaydı yok) — Private intake form (Turnstile, no IP logging)
- [ ] Bot mesaj metinlerinin Türkçe/İngilizce gözden geçirilmesi **(good first issue)** — Review of bot message texts in TR/EN

### Aşama 4 — Yayıncılar / Phase 4 — Publishers

- [ ] Yayın kuyruğu ve `publisher` Worker — Publish queue and publisher Worker
- [ ] Telegram (TR) kanalı — Telegram (TR) channel
- [ ] Bluesky (EN) — Bluesky (EN)
- [ ] RSS / JSON Feed — RSS / JSON Feed
- [ ] Hız sınırları (saatte ≤4, günde ≤30) ve acil durdurma — Rate limits and kill switch
- [ ] Otomatik düzeltme gönderileri — Automatic correction posts
- [ ] Gönderi şablonları için örnek çıktı testleri **(good first issue)** — Snapshot tests for post templates
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
