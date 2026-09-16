// Every database access the bot makes.
//
// Two D1 databases, exactly as `db/migrations` defines them; this Worker adds no table and no
// column of its own. `gt-ops` holds the queue and the decisions, `gt-signals` holds what was
// collected. D1 cannot JOIN across databases, so the two are joined in the Worker on
// `content_hash` (db/README.md).
//
// Timestamps are produced by SQLite (`strftime('%Y-%m-%dT%H:%M:%SZ','now')`) rather than by
// JavaScript, so they always satisfy the CHECK constraints in the schema.

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

/** How many candidates are waiting. */
export async function countQueued(config) {
  const row = await config.ops
    .prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'queued'")
    .first();
  return Number(row?.n ?? 0);
}

/** Decision counts by status, for `/durum`. */
export async function statusCounts(config) {
  const result = await config.ops
    .prepare('SELECT status, COUNT(*) AS n FROM reviews GROUP BY status')
    .all();
  const counts = {};
  for (const row of result?.results ?? []) counts[row.status] = Number(row.n);
  return counts;
}

/**
 * The next queued reviews, oldest first.
 *
 * `after` is the cursor of the last item the reviewer saw ({createdAt, id}); "sonra" advances it
 * so a skipped item does not come back in the same sitting. Ordering matches the
 * `reviews (status, created_at)` index.
 */
export async function nextReviews(config, { limit = 5, after = null } = {}) {
  const sql = after
    ? `SELECT id, content_hash, status, summary_tr, summary_en, created_at
         FROM reviews
        WHERE status = 'queued' AND (created_at > ?1 OR (created_at = ?1 AND id > ?2))
        ORDER BY created_at ASC, id ASC
        LIMIT ?3`
    : `SELECT id, content_hash, status, summary_tr, summary_en, created_at
         FROM reviews
        WHERE status = 'queued'
        ORDER BY created_at ASC, id ASC
        LIMIT ?1`;
  const statement = after
    ? config.ops.prepare(sql).bind(after.createdAt, after.id, limit)
    : config.ops.prepare(sql).bind(limit);
  const result = await statement.all();
  return result?.results ?? [];
}

/** One review by id, whatever its status. */
export async function reviewById(config, id) {
  return config.ops
    .prepare(
      `SELECT id, content_hash, status, summary_tr, summary_en, telegram_message_id,
              decided_by, decided_at, note, created_at
         FROM reviews WHERE id = ?1`,
    )
    .bind(id)
    .first();
}

/**
 * The collected signals behind a set of content hashes, keyed by hash.
 *
 * The excerpt is already capped at 1000 characters by the schema; the bot trims it further when
 * it renders the message.
 */
export async function signalsByHash(config, hashes) {
  const unique = [...new Set(hashes.filter((hash) => typeof hash === 'string' && hash !== ''))];
  if (unique.length === 0) return new Map();
  const placeholders = unique.map((_, index) => `?${index + 1}`).join(', ');
  const result = await config.signals
    .prepare(
      `SELECT content_hash, url, title, text, lang, region, triage_score, published_at, fetched_at
         FROM signals WHERE content_hash IN (${placeholders})`,
    )
    .bind(...unique)
    .all();
  const byHash = new Map();
  for (const row of result?.results ?? []) byHash.set(row.content_hash, row);
  return byHash;
}

/**
 * The reviewer row for a Telegram user id.
 *
 * `reviewers` holds no real name and no contact detail — a numeric Telegram id, a role and a
 * flag — and the bot never writes anything else into it. A reviewer row is created by a
 * maintainer, out of band; the bot cannot enrol anybody.
 */
export async function activeReviewer(config, telegramUserId) {
  return config.ops
    .prepare(
      `SELECT id, role, active FROM reviewers WHERE telegram_user_id = ?1 AND active = 1`,
    )
    .bind(telegramUserId)
    .first();
}

/**
 * Write a decision.
 *
 * `onayla` → `drafted`: approved for a draft record, which is **not** a publication and not a
 * pull request. `reddet` → `dismissed`. The WHERE clause keeps it idempotent: a second tap on the
 * same button changes nothing and reports that the item was already decided.
 *
 * @returns {Promise<boolean>} true when this call was the one that decided the item.
 */
export async function recordDecision(config, { reviewId, reviewerId, status, note = null }) {
  if (status !== 'drafted' && status !== 'dismissed') {
    throw new Error(`recordDecision refuses status ${status}`);
  }
  const result = await config.ops
    .prepare(
      `UPDATE reviews
          SET status = ?1, decided_by = ?2, decided_at = ${NOW}, note = COALESCE(?3, note)
        WHERE id = ?4 AND status = 'queued'`,
    )
    .bind(status, reviewerId, note, reviewId)
    .run();
  return Number(result?.meta?.changes ?? 0) > 0;
}

/**
 * Write a skip ("sonra").
 *
 * A skip is not a decision: the row stays `queued` and `decided_by` stays empty, so the item
 * comes back in a later sitting. Who skipped it and when is recorded in `note`, which is
 * overwritten rather than appended so repeated skips cannot grow the row without bound.
 */
export async function recordSkip(config, { reviewId, reviewerId }) {
  const result = await config.ops
    .prepare(
      `UPDATE reviews
          SET note = 'sonra / skipped by reviewer ' || ?1 || ' at ' || ${NOW}
        WHERE id = ?2 AND status = 'queued'`,
    )
    .bind(reviewerId, reviewId)
    .run();
  return Number(result?.meta?.changes ?? 0) > 0;
}

/** Remember which message shows a candidate, so a later step can edit it in place. */
export async function rememberMessageId(config, { reviewId, messageId }) {
  await config.ops
    .prepare('UPDATE reviews SET telegram_message_id = ?1 WHERE id = ?2')
    .bind(messageId, reviewId)
    .run();
}
