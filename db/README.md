# db

[Türkçe](#türkçe) · [English](#english) · [Teknik başvuru / Technical reference](#teknik-başvuru--technical-reference)

> Durum: `0001_init` migration'ları 2026-09-16'da uzak D1 veritabanlarına uygulandı; aynı gün `signals` için `0002` de uygulandı ve günlük toplayıcı çalışması artık `gt-signals`'a yazıyor. Henüz hiçbir Worker bağlı değil ve `ops` boş. / Status: the `0001_init` migrations were applied to the remote D1 databases on 2026-09-16, `signals` `0002` the same day, and the daily collector run now writes into `gt-signals`. No Worker is bound yet and `ops` is empty.

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
`id`, `type` (`bulletin` | `record` | `correction`), `record_id`, `review_id`, `channel`, `lang`, `status` (`queued` | `held` | `posted` | `failed` | `deleted`), `text`, `external_id`, `external_url`, `corrects_publication_id`, `idempotency_key`, `approved_by`, `posted_at`, `created_at` — UNIQUE (`idempotency_key`, `channel`): bir kuyruk mesajı kanal başına bir satır üretir / one queue message becomes one row per channel

**usage_ledger** — ücretsiz kota defteri / free quota ledger
`day` (UTC `YYYY-MM-DD`), `service` (`github-models` | `workers-ai` | `queues` | `d1-writes` | …), `units`, `daily_limit`, `updated_at` — PK (`day`, `service`)

**reviewers** — izin listesi / allowlist
`id`, `github_login`, `telegram_user_id` (UNIQUE), `role` (`reviewer` | `maintainer`), `active`, `added_by`, `added_at`

**collector_state**
`collector_id` (PK), `enabled`, `last_run_at`, `last_success_at`, `next_due_at`, `cursor` (ETag / Last-Modified / son kimlik / last id), `consecutive_failures`, `last_error`

### Uzak veritabanları / Remote databases

Cloudflare hesabında oluşturuldu (2026-09-16). Veritabanı kimlikleri gizli değildir; erişim hesap yetkisiyle olur.
Created in the Cloudflare account on 2026-09-16. Database IDs are not secrets; access is controlled by account permissions.

| Ad / Name | `database_id` | Migration |
|---|---|---|
| `gt-signals` | `4185c945-18b6-4fe6-9531-f0d99a858554` | `migrations/signals/0001_init.sql` — 1 tablo / table, `0002_timestamp_checks_for_d1.sql` |
| `gt-ops` | `414b8a8b-f28a-40b5-8de3-fba47ec9d784` | `migrations/ops/0001_init.sql` — 6 tablo / tables |

```bash
# migration uygulama / applying a migration
npx wrangler d1 execute gt-signals --remote --file db/migrations/signals/0001_init.sql
npx wrangler d1 execute gt-ops     --remote --file db/migrations/ops/0001_init.sql
# okuma / reading
npx wrangler d1 execute gt-ops --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

GitHub Actions'tan yazmak için depoya `CLOUDFLARE_API_TOKEN` secret'ı gerekir; yerelden `wrangler login` yeterlidir.
Writing from GitHub Actions needs a `CLOUDFLARE_API_TOKEN` repository secret; locally `wrangler login` is enough.

### Kim yazıyor / Who writes

`signals` tablosuna bugün yazan tek şey, günlük `collect` iş akışının son adımıdır
([`.github/workflows/collect.yml`](../.github/workflows/collect.yml)): inceleme konusu açıldıktan sonra
`gt-collect --write-d1 queue` çalışır ve çalışmanın tamamını yazar. `ops` veritabanına henüz hiçbir şey yazmaz.

Today the only writer of the `signals` table is the last step of the daily `collect` workflow: after the review
issue exists, `gt-collect --write-d1 queue` writes the whole run. Nothing writes to `ops` yet.

- **Ne yazılır / What is written**: kuyruğa giren (`triage_status = 'queued'`), sonraki çalışmaya kalan
  (`pending`) ve ilgi eşiğinin altında kalan (`scored`) her aday. Sütun eşlemesinin tamamı
  [collectors/README.md](../collectors/README.md#sinyal-deposu--signal-store) içindedir. / Every candidate the run
  produced, with its triage status; the full column mapping is in the collectors README.
- **Ne yazılmaz / What is never written**: Türk kuvvetleri güvenlik süzgecinin veya coğrafi çitin elediği hiçbir
  kayıt — ne burada ne başka bir yerde (ADR 0013). / Nothing the Turkish-forces safety filter or the geofence
  dropped, here or anywhere else.
- **Ne zaman / When**: her gün 05:23 UTC, konudan ve defter commit'inden sonra. / Daily at 05:23 UTC, after the
  issue and the ledger commit.
- **Gereken tek sır / The one secret**: `CLOUDFLARE_API_TOKEN` (yalnızca ortamdan; yerelde `wrangler login`
  yeterlidir). Sır yoksa adım gerekçesini günlüğe yazıp atlanır ve boru hattı bugünkü gibi çalışır. Belirtecin
  birden çok hesabı görmesi hâlinde `CLOUDFLARE_ACCOUNT_ID` deposu değişkeni gerekir (sır değildir). /
  `CLOUDFLARE_API_TOKEN`, from the environment only; without it the step is skipped with a log line and the
  pipeline works exactly as before. If the token can see more than one account, add the repository variable
  `CLOUDFLARE_ACCOUNT_ID` (not a secret).
- **Tekilleştirme / Deduplication**: hâlâ `collector-state` dalındaki git defterinden gelir; D1 eklemedir.
  `content_hash` UNIQUE olduğu için `INSERT … ON CONFLICT DO NOTHING` aynı partinin iki kez yazılmasını zararsız
  kılar. / Still the git ledger; D1 is additive, and the UNIQUE `content_hash` makes a replayed batch harmless.

### Uygulama notları / Implementation notes

- **LIKE/GLOB karmaşıklığı / pattern complexity**: D1, on joker karakter veya karakter sınıfından fazlasını
  içeren bir `LIKE`/`GLOB` desenini reddeder (`LIKE or GLOB pattern too complex`, `SQLITE_ERROR 7500`) — ve bunu
  `CREATE TABLE` sırasında değil, her `INSERT` sırasında yapar. Yerel SQLite aynı deseni sorunsuz çalıştırdığı
  için sorun ancak uzak veritabanında görülür. `signals` zaman damgası kontrolleri bu yüzden `0002` ile iki kısa
  desene bölündü. **`ops` tabloları hâlâ uzun deseni taşıyor**: oraya bir şey yazılmadan önce aynı düzeltme
  gerekir. / D1 refuses a `LIKE`/`GLOB` pattern with more than ten wildcards or character classes, on every
  `INSERT` rather than at `CREATE TABLE`; local SQLite runs the same pattern happily, so only the remote database
  shows it. The `signals` timestamp checks were therefore split into two short patterns in `0002`. **The `ops`
  tables still carry the long pattern** and need the same fix before anything writes to them.
  `db/tests` fails if a `signals` pattern grows past the limit again.
- **STRICT** tables everywhere (column types are enforced). `CHECK` constraints enforce the enums, `sha256:` hashes, TypeID prefixes, JSON validity (`json_valid`), the ≤300/≤1000-character title/text limits (excerpts, never full text), and the timestamp format. Timestamps are exactly `YYYY-MM-DDTHH:MM:SSZ`, so they sort as text.
- `simhash` is a signed 64-bit INTEGER. On the wire, collectors send it as 16 hex characters (JS numbers cannot hold 64 bits).
- `reviews.content_hash` is UNIQUE: one review per signal, so replayed triage results are harmless. A decision (`status <> 'queued'`) must record `decided_by` and `decided_at`.
- `publications`:
  - `record` rows need a `record_id` (`evt_…`), `correction` rows a `corrects_publication_id`, and `posted` rows a `posted_at`.
  - `channel` is a lowercase code, checked by pattern rather than a fixed list, so a new channel needs no table rebuild.
- `usage_ledger` and `collector_state` are updated all day, so they are `WITHOUT ROWID`: the primary key is the table, and an upsert costs one written row instead of two.
- D1 enforces foreign keys by default. Within `ops`, `decided_by`, `promoted_by`, `review_id` and `corrects_publication_id` are real foreign keys. Cross-database references (`content_hash`) are not.

**Yazma bütçesi / Write budget** (100,000 rows written per day; every index entry counts):

| İşlem / Operation | Yazılan satır / Rows written |
|---|---|
| `signals` insert (row + `content_hash` UNIQUE + `(triage_status, created_at)`) | ≈ 3 |
| Duplicate insert (`INSERT … ON CONFLICT (content_hash) DO NOTHING`) | 0 |
| Triage status update (row + one index entry) | ≈ 2 |
| Retention delete | ≈ 3 |
| **Per signal lifetime** | **≈ 8 → at most ~12,000 new signals/day** |

The `ops` tables handle hundreds of rows per day, so their lookup indexes are cheap: `reviews (status, created_at)` for the queue, `publications (channel, posted_at)` for rate limits, and UNIQUE `drafts.pr_number` and `reviewers.telegram_user_id`. `db/tests` fails if an index is added to `signals` or to the hot tables without updating the test, so any new index has to be a deliberate choice.

**Saklama / Retention** (daily, scheduler Worker). The one `signals` index serves this query, so no extra time index is written:

```sql
DELETE FROM signals WHERE id IN (
  SELECT id FROM signals
  WHERE triage_status IN ('pending','scored','duplicate','dropped','queued')
    AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 days')
  LIMIT 500);   -- repeat until 0 rows; stop early if the day's write budget runs low
```

**Test**: `python -m unittest discover -s db/tests -v` applies every migration to in-memory SQLite. It checks constraints, the index set and the query plans (standard library only; CI: `.github/workflows/db-ci.yml`).

### Migration kuralları / Migration conventions

- Veritabanı başına ayrı klasör, çünkü Wrangler her D1 bağlaması için tek bir `migrations_dir` kullanır. / One folder per database, since Wrangler uses one `migrations_dir` per D1 binding:
  - `db/migrations/ops/0001_init.sql`
  - `db/migrations/signals/0001_init.sql`
- Dört haneli sıra numarası + kısa açıklama: `0002_add_publications_index.sql`. / Four-digit sequence + short description.
- Yalnızca ileri yönlü; uygulanmış bir migration asla değiştirilmez, düzeltme yeni migration ile yapılır. / Forward-only; an applied migration is never edited, fixes go in a new migration.
- Yerelde deneme: `wrangler d1 migrations apply <db> --local`. / Try locally with `--local`.
- Uzak uygulama yalnızca zorunlu gözden geçirici onaylı bir environment'taki iş akışından: `wrangler d1 migrations apply <db> --remote`. / Remote apply only from a workflow in an environment with required reviewers.
- Büyük silme ve güncellemeler günlük yazma bütçesini aşmamak için partiler hâlinde yapılır. / Large deletes and updates run in batches to stay within the daily write budget.
