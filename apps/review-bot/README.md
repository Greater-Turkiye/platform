# apps/review-bot

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım. Henüz kod yok. / Status: design. No code yet.

## Türkçe

`review-bot`, **Kapı 1**'i işleten Cloudflare Worker'ıdır. Triyajı geçen öğeleri özel Telegram inceleyici grubuna gönderir ve gözden geçiricilerin kararlarını uygular: öğeyi reddetmek, `datasets` deposunda PR olarak açılacak bir taslağa yükseltmek veya atfedilmiş bir bülten olarak yayın kuyruğuna göndermek. Bot yalnızca webhook ile çalışır; Telegram'ın gizli token başlığını doğrular, yalnızca inceleme grubundan gelen ve izin listesindeki gözden geçiricilere ait işlemleri kabul eder. Her karar kimin verdiğiyle birlikte `reviews` tablosuna yazılır.

Taslağı yükselten gözden geçirici, ortaya çıkan PR'ın tek onaylayıcısı olamaz (planlanan CI denetimi).

## English

`review-bot` is the Cloudflare Worker that operates **Gate 1**. It posts items that passed triage to the private Telegram reviewer group and applies reviewers' decisions: dismiss the item, promote it to a draft that becomes a PR in the `datasets` repository, or send it to the publish queue as an attributed bulletin. The bot runs on a webhook only; it verifies Telegram's secret token header and accepts actions only from the review group and only from allowlisted reviewers. Every decision is written to the `reviews` table together with who made it.

The reviewer who promoted a draft cannot be the only approver of the resulting PR (planned CI check).

---

## Teknik başvuru / Technical reference

### Komutlar / Commands

| Komut / Command | Kim / Who | Etki / Effect |
|---|---|---|
| `/queue` | Gözden geçirici / reviewer | Bekleyen öğeleri listeler / list pending items |
| `/status` | Gözden geçirici / reviewer | Toplayıcı, kuyruk ve durdurma durumu / collector, queue and pause status |
| `/quota` | Gözden geçirici / reviewer | Günlük kota defteri özeti / daily usage ledger summary |
| `/stop` | Her gözden geçirici / any reviewer | Yayını durdurur (`publish:paused`) / pause publishing |
| `/resume` | Yönetici / maintainer | Yayını sürdürür; bekleyenleri yeniden incelemeye açar / resume publishing; reopen held items for review |
| `/help` | Herkes (grupta) / anyone in group | Yardım / help |

### Öğe düğmeleri / Item buttons

| Düğme / Button | Etki / Effect |
|---|---|
| Reddet / Dismiss | `reviews.status = dismissed` |
| Taslak / Draft | GitHub App ile `datasets`'te dal + YAML kaydı + PR (`data-submission`) / branch + YAML record + PR via GitHub App |
| Bülten / Bulletin | TR/EN önizleme → onay → `PUBLISH_QUEUE` (yalnızca A–B kaynaklar) / preview → confirm → queue (A–B sources only) |
| Kırmızı çizgi / Red line | Öğeyi gizler, yöneticileri uyarır, gerekirse sinyali siler / hides the item, alerts maintainers, deletes the signal if needed |

### Güvenlik / Security

- `X-Telegram-Bot-Api-Secret-Token` başlığı sabit zamanlı karşılaştırılır. / Compared in constant time.
- `chat.id` ≠ `TELEGRAM_REVIEW_CHAT_ID` olan güncellemeler yok sayılır. / Updates from any other chat are ignored.
- `from.id` `reviewers` tablosunda aktif değilse işlem reddedilir. / Actions from non-active reviewers are rejected.
- Grup davet bağlantısı kapalı; bot medya indirmez. / Group invite link disabled; the bot does not download media.

### Bağlamalar / Bindings

D1 `OPS_DB` · KV `CONFIG` · Queue producer `PUBLISH_QUEUE`

### Sırlar (yalnızca adlar) / Secrets (names only)

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_REVIEW_CHAT_ID`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`
