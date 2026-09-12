# db

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: tasarım. Migration dosyaları Aşama 2'de eklenecek. / Status: design. Migration files arrive in Phase 2.

## Türkçe

Platform iki Cloudflare D1 (SQLite) veritabanı kullanır: ham sinyaller için `signals` (90 gün saklama) ve iş akışı durumu için `ops`. D1'de veritabanları arası JOIN yapılamadığından `ops` tabloları sinyallere `content_hash` ile başvurur. Ücretsiz plandaki günlük 100 bin satır yazma sınırına dizin güncellemeleri de dahil olduğu için dizinler asgari tutulur. Zaman damgaları UTC, ISO 8601 metin olarak saklanır. Gözden geçirici tablosunda gerçek ad veya iletişim bilgisi tutulmaz.

## English

The platform uses two Cloudflare D1 (SQLite) databases: `signals` for raw signals (90-day retention) and `ops` for workflow state. Because D1 cannot JOIN across databases, `ops` tables reference signals by `content_hash`. Index updates count toward the free plan's 100,000 rows written per day, so indexes are kept to a minimum. Timestamps are stored as UTC ISO 8601 text. The reviewers table holds no real names or contact details.

---

## Teknik başvuru / Technical reference

### `signals` veritabanı / database

**signals**

| Sütun / Column | Tür / Type | Not / Note |
|---|---|---|
| `id` | INTEGER PK | |
| `content_hash` | TEXT UNIQUE NOT NULL | SHA-256(normalleştirilmiş URL + metin / normalized URL + text) |
| `simhash` | INTEGER | 64-bit, yakın kopya / near-duplicate |
| `raw_hash` | TEXT | Ham bayt özeti / raw bytes hash |
| `source_id` | TEXT | `src_…` |
| `collector_id` | TEXT | |
| `url` | TEXT NOT NULL | |
| `lang` | TEXT | |
| `title` | TEXT | |
| `text` | TEXT | Kısaltılmış / truncated |
| `region` | TEXT | Sözlük kodu / vocab code |
| `geo_json` | TEXT | Konum ipucu (JSON) / location hint |
| `published_at` | TEXT | |
| `fetched_at` | TEXT NOT NULL | |
| `triage_status` | TEXT | `pending` \| `scored` \| `duplicate` \| `dropped` \| `queued` |
| `triage_score` | REAL | |
| `triage_labels` | TEXT | JSON |
| `created_at` | TEXT NOT NULL | Saklama silmeleri bununla / retention uses this |

Dizinler / Indexes: `content_hash` (UNIQUE), `(triage_status, created_at)`.

### `ops` veritabanı / database

**reviews** — inceleme kuyruğu ve kararlar / review queue and decisions
`id`, `content_hash`, `status` (`queued` | `dismissed` | `drafted` | `bulletined` | `redline`), `summary_tr`, `summary_en`, `telegram_message_id`, `decided_by` (→ reviewers.id), `decided_at`, `note`, `created_at`

**drafts** — `datasets` PR'ları / `datasets` PRs
`id`, `review_id`, `kind` (`event` | `actor` | `site` | `equipment` | `source`), `record_id`, `branch`, `pr_number`, `pr_url`, `promoted_by`, `state` (`open` | `merged` | `closed`), `created_at`, `updated_at`

**publications** — kanal gönderileri / channel posts
`id`, `type` (`bulletin` | `record` | `correction`), `record_id`, `review_id`, `channel`, `lang`, `status` (`queued` | `held` | `posted` | `failed` | `deleted`), `text`, `external_id`, `external_url`, `corrects_publication_id`, `idempotency_key` (UNIQUE), `approved_by`, `posted_at`, `created_at`

**usage_ledger** — ücretsiz kota defteri / free quota ledger
`day` (UTC `YYYY-MM-DD`), `service` (`github-models` | `workers-ai` | `queues` | `d1-writes` | …), `units`, `daily_limit`, `updated_at` — PK (`day`, `service`)

**reviewers** — izin listesi / allowlist
`id`, `github_login`, `telegram_user_id` (UNIQUE), `role` (`reviewer` | `maintainer`), `active`, `added_by`, `added_at`

**collector_state**
`collector_id` (PK), `enabled`, `last_run_at`, `last_success_at`, `next_due_at`, `cursor` (ETag / Last-Modified / son kimlik / last id), `consecutive_failures`, `last_error`

### Migration kuralları / Migration conventions

- Veritabanı başına ayrı klasör, çünkü Wrangler her D1 bağlaması için tek bir `migrations_dir` kullanır. / One folder per database, since Wrangler uses one `migrations_dir` per D1 binding:
  - `db/migrations/ops/0001_init.sql`
  - `db/migrations/signals/0001_init.sql`
- Dört haneli sıra numarası + kısa açıklama: `0002_add_publications_index.sql`. / Four-digit sequence + short description.
- Yalnızca ileri yönlü; uygulanmış bir migration asla değiştirilmez, düzeltme yeni migration ile yapılır. / Forward-only; an applied migration is never edited, fixes go in a new migration.
- Yerelde deneme: `wrangler d1 migrations apply <db> --local`. / Try locally with `--local`.
- Uzak uygulama yalnızca zorunlu gözden geçirici onaylı bir environment'taki iş akışından: `wrangler d1 migrations apply <db> --remote`. / Remote apply only from a workflow in an environment with required reviewers.
- Büyük silme ve güncellemeler günlük yazma bütçesini aşmamak için partiler hâlinde yapılır. / Large deletes and updates run in batches to stay within the daily write budget.
