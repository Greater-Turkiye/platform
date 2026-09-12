# Greater-Turkiye/platform

[Türkçe](#türkçe) · [English](#english)

---

## Türkçe

### Bu platform ne olacak?

Açık kaynaklardan sinyal toplayan, bunları eleyen ve sıraya koyan, insan incelemesine sunan ve yalnızca onaylanan içeriği [datasets](https://github.com/Greater-Turkiye/datasets) deposuna ve yayın kanallarımıza (Telegram, Bluesky, RSS) ileten **sıfır bütçeli** bir altyapı. GitHub Actions, Cloudflare Workers/D1/Queues/KV ve ücretsiz API'lerin ücretsiz katmanları üzerine kurulur. Hiçbir hesapta ödeme yöntemi tanımlı değildir; bu nedenle ücretsiz sınırlar aşılamaz tavanlardır.

Değişmez kurallar:

- **Hiçbir şey insan onayı olmadan yayımlanmaz.** Otomasyon ve dil modelleri yalnızca öneride bulunur.
- **Türk kuvvetleri güvenlik filtresi**, veri daha diske yazılmadan önce çalışır ([collectors/README.md](collectors/README.md)).
- Tüm yayınlar kaynağa atfedilir; doğrulanmamış içerik açıkça etiketlenir.

### Durum

**Aşama 1 — iskelet.** Bu depoda şimdilik yalnızca dizin yapısı ve tasarım belgeleri var; **çalışan kod yok**. Ayrıntılar: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md).

### Dizin haritası

```text
platform/
├── ARCHITECTURE.md      Mimari, ücretsiz katman sınırları, riskler
├── ROADMAP.md           Aşamalar ve görevler
├── apps/
│   ├── api/             Ingest, webhook'lar, akışlar (Cloudflare Worker)
│   ├── review-bot/      Telegram inceleyici botu (Worker)
│   ├── scheduler/       Cron → workflow_dispatch (Worker)
│   └── web/             Statik site ve yönetim arayüzü (sonra)
├── collectors/          GitHub Actions'ta çalışan Python (uv) toplayıcılar
├── publishers/          Yayın kuyruğu tüketicisi (Worker)
├── db/                  D1 şeması ve migration'lar
└── docs/                Tehdit modeli ve tasarım notları
```

### Nasıl yardım edebilirim?

- [ROADMAP.md](ROADMAP.md) içinde **(good first issue)** ile işaretli görevlere bakın.
- Açık [good first issue](https://github.com/Greater-Turkiye/platform/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) listesini inceleyin.
- Mimari hakkında soru ve önerileriniz için [Tartışmalar](https://github.com/orgs/Greater-Turkiye/discussions).
- Önce [katkı rehberini](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) ve [kırmızı çizgileri](https://github.com/Greater-Turkiye/handbook/blob/main/tr/02-red-lines.md) okuyun.

### Lisans

Kod [MIT](LICENSE). Platformun ürettiği veriler `datasets` deposunda CC BY 4.0 ile yayımlanır.

---

## English

### What will this platform be?

A **zero-budget** pipeline that collects signals from public sources, filters and queues them, presents them for human review, and forwards only approved content to the [datasets](https://github.com/Greater-Turkiye/datasets) repository and our publishing channels (Telegram, Bluesky, RSS). It is built on the free tiers of GitHub Actions, Cloudflare Workers/D1/Queues/KV and free APIs. No account has a payment method attached, so free limits are hard caps.

Non-negotiable rules:

- **Nothing is published without human approval.** Automation and language models only make suggestions.
- The **Turkish-forces safety filter** runs before any data is written to storage ([collectors/README.md](collectors/README.md)).
- Every post is attributed to its source; unverified content is clearly labelled.

### Status

**Phase 1 — skeleton.** This repository currently contains only the directory structure and design documents; **there is no working code yet**. Details: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md).

### Directory map

```text
platform/
├── ARCHITECTURE.md      Architecture, free-tier limits, risks
├── ROADMAP.md           Phases and tasks
├── apps/
│   ├── api/             Ingest, webhooks, feeds (Cloudflare Worker)
│   ├── review-bot/      Telegram reviewer bot (Worker)
│   ├── scheduler/       Cron → workflow_dispatch (Worker)
│   └── web/             Static site and admin UI (later)
├── collectors/          Python (uv) collectors run in GitHub Actions
├── publishers/          Publish queue consumer (Worker)
├── db/                  D1 schema and migrations
└── docs/                Threat model and design notes
```

### How to help

- Look for tasks marked **(good first issue)** in [ROADMAP.md](ROADMAP.md).
- Browse the open [good first issues](https://github.com/Greater-Turkiye/platform/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
- Bring architecture questions and ideas to [Discussions](https://github.com/orgs/Greater-Turkiye/discussions).
- Read the [contributing guide](https://github.com/Greater-Turkiye/.github/blob/main/CONTRIBUTING.md) and the [red lines](https://github.com/Greater-Turkiye/handbook/blob/main/en/02-red-lines.md) first.

### Licence

Code is [MIT](LICENSE). Data produced by the platform is published in the `datasets` repository under CC BY 4.0.
