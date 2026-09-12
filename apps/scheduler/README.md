# apps/scheduler

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım. Henüz kod yok. / Status: design. No code yet.

## Türkçe

`scheduler`, Cron Trigger ile çalışan bir Cloudflare Worker'ıdır. GitHub Actions'ın `schedule:` tetikleyicisi yerine kullanılır, çünkü herkese açık depolarda zamanlanmış iş akışları 60 gün etkinlik olmazsa devre dışı kalır ve gecikebilir. Her 15 dakikada bir, zamanı gelen toplayıcıları belirler ve bu depodaki toplayıcı iş akışını GitHub REST API'si üzerinden `workflow_dispatch` ile tetikler. Günde bir kez bakım işlerini (90 günlük saklama silmeleri gibi) çalıştırır. KV'deki `collect:paused` anahtarı açıksa hiçbir şey tetiklemez.

## English

`scheduler` is a Cloudflare Worker running on a Cron Trigger. It replaces GitHub Actions' `schedule:` trigger, because scheduled workflows in public repositories are disabled after 60 days of inactivity and can run late. Every 15 minutes it works out which collectors are due and triggers the collector workflow in this repository through the GitHub REST API with `workflow_dispatch`. Once a day it runs maintenance jobs (such as 90-day retention deletes). If the `collect:paused` key in KV is set, it triggers nothing.

---

## Teknik başvuru / Technical reference

### Cron

| İfade / Expression | Görev / Job |
|---|---|
| `*/15 * * * *` | Zamanı gelen toplayıcıları ve triyaj işini tetikle / dispatch due collectors and the triage job |
| `17 3 * * *` | Günlük bakım: `signals` saklama silmeleri (partiler hâlinde), kota defteri özeti / daily maintenance: batched retention deletes, usage ledger summary |

### Tetikleme / Dispatch

```text
POST https://api.github.com/repos/Greater-Turkiye/platform/actions/workflows/collect.yml/dispatches
Authorization: Bearer <GitHub App installation token>
{"ref": "main", "inputs": {"collectors": "rss-example-mod,firms-global"}}
```

- Zamanı gelen toplayıcılar `collector_state.next_due_at` ile seçilir; tetiklemeden sonra güncellenir. / Due collectors are selected by `next_due_at` and updated after dispatch.
- Art arda hata alan toplayıcılar üstel geri çekilmeyle ertelenir; eşik aşılınca inceleyici grubuna uyarı gider. / Collectors that keep failing are backed off exponentially; past a threshold, the reviewer group is alerted.
- App kurulumu yalnızca `platform` deposunda `actions: write` iznine sahiptir. / The App installation has only `actions: write` on the `platform` repository.

### Bağlamalar / Bindings

D1 `OPS_DB` (`collector_state`, `usage_ledger`) · D1 `SIGNALS_DB` (saklama silmeleri / retention deletes) · KV `CONFIG`

### Sırlar (yalnızca adlar) / Secrets (names only)

`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`
