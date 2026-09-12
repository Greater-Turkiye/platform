# apps/api

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım. Henüz kod yok. / Status: design. No code yet.

## Türkçe

`api`, platformun giriş kapısı olan Cloudflare Worker'ıdır: toplayıcılardan gelen imzalı sinyal partilerini alır, güvenlik filtresini ikinci kez uygular, `signals` veritabanına yazar; triyaj işine bekleyen öğeleri verir ve sonuçları `ops` veritabanına işler; GitHub App webhook'larını (birleştirilen `datasets` PR'ları) karşılayıp yayın kuyruğuna kayıt gönderileri koyar; RSS/JSON akışlarını sunar. Worker ince tutulur, ağır işler Actions'ta yapılır.

## English

`api` is the Cloudflare Worker that acts as the platform's front door: it receives signed signal batches from collectors, applies the safety filter a second time and writes to the `signals` database; hands pending items to the triage job and stores results in `ops`; handles GitHub App webhooks (merged `datasets` PRs) and enqueues record posts; and serves the RSS/JSON feeds. The Worker stays thin; heavy work happens in Actions.

---

## Teknik başvuru / Technical reference

### Planlanan uç noktalar / Planned endpoints

| Yöntem / Method | Yol / Path | Kimlik doğrulama / Auth | Amaç / Purpose | Aşama / Phase |
|---|---|---|---|---|
| POST | `/v1/ingest` | HMAC | ≤100 sinyallik parti; kabul/kopya/ret sayıları döner / batch of ≤100 signals; returns accepted/duplicate/rejected counts | 2 |
| GET | `/v1/triage/pending` | HMAC | Triyaj bekleyen sinyaller / signals awaiting triage | 3 |
| POST | `/v1/triage/results` | HMAC | Puanlar, etiketler, yakın kopya işaretleri; eşiği geçenler inceleme kuyruğuna / scores, labels, near-dup flags; above-threshold items enter the review queue | 3 |
| POST | `/v1/intake` | Turnstile | Özel bildirim formu; `ops` inceleme kuyruğuna gider, asla herkese açık değil, IP kaydı yok / private intake form; goes to the `ops` review queue, never public, no IP logging | 3 |
| POST | `/v1/github/webhook` | `X-Hub-Signature-256` | App olayları: birleştirilen PR → kayıt gönderisi; değişiklik → düzeltme; tombstone → kaldırma / App events: merged PR → record post; change → correction; tombstone → removal | 4 |
| GET | `/feeds/tr.xml`, `/feeds/en.xml`, `/feeds/tr.json`, `/feeds/en.json` | — | RSS 2.0 ve JSON Feed / RSS 2.0 and JSON Feed | 4 |
| POST | `/v1/ai/classify` | HMAC | Workers AI yedeği; yalnızca şemaya uygun JSON döner / Workers AI fallback; returns schema-valid JSON only | 6 |
| GET | `/healthz` | — | Canlılık, veri içermez / liveness, no data | 2 |

### HMAC şeması / HMAC scheme

```text
X-GT-Timestamp: <unix seconds>
X-GT-Signature: sha256=<hex(HMAC-SHA256(key, timestamp + "." + raw_body))>
```

- Saat farkı 300 saniyeden fazlaysa reddedilir; karşılaştırma sabit zamanlıdır. / Rejected if clock skew exceeds 300 s; constant-time comparison.
- Anahtar değişiminde iki anahtar birlikte kabul edilir (`INGEST_HMAC_KEY`, `INGEST_HMAC_KEY_PREVIOUS`). / During rotation, both keys are accepted.
- Yinelenen partiler `content_hash` UNIQUE kısıtıyla zararsızdır (idempotent). / Replayed batches are harmless thanks to the `content_hash` UNIQUE constraint.

### Bağlamalar / Bindings

| Ad / Name | Tür / Type | Kullanım / Use |
|---|---|---|
| `SIGNALS_DB` | D1 | `signals` veritabanı / database |
| `OPS_DB` | D1 | `ops` veritabanı / database |
| `CONFIG` | KV | Yapılandırma, eşikler, acil durdurma okuma / config, thresholds, kill switch read |
| `PUBLISH_QUEUE` | Queue (producer) | Kayıt ve düzeltme gönderileri / record and correction posts |
| `AI` | Workers AI | Aşama 6 yedeği / Phase 6 fallback |

### Sırlar (yalnızca adlar) / Secrets (names only)

`INGEST_HMAC_KEY`, `INGEST_HMAC_KEY_PREVIOUS`, `GITHUB_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`
