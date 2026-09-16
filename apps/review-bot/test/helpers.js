// Test doubles: an in-memory stand-in for D1 and one for the Telegram API.
//
// The fake D1 does not parse SQL; it recognises the handful of statements this Worker issues and
// applies the same rules the real schema enforces (`db/migrations/ops/0001_init.sql`), so a test
// fails if the Worker ever writes a decision without a reviewer and a timestamp, or writes a
// status the schema does not allow.
//
// None of the values below is a credential. The token and the secret are fabricated strings that
// are only there to satisfy the shape checks in src/config.js.

export const CHAT_ID = -1002000000001;
export const REVIEWER_USER_ID = 900000001;
export const STRANGER_USER_ID = 900000009;
export const WEBHOOK_SECRET = 'test-webhook-secret-not-a-credential';
export const BOT_TOKEN = '1111111111:test-bot-token-not-a-credential';
export const FAKE_NOW = '2026-09-16T10:00:00Z';

const STATUSES = new Set(['queued', 'dismissed', 'drafted', 'bulletined', 'redline']);

function squash(sql) {
  return sql.replace(/\s+/gu, ' ').trim();
}

/** A minimal D1 stand-in over plain arrays. */
export function createFakeD1(tables) {
  const data = {
    reviews: [],
    reviewers: [],
    signals: [],
    ...tables,
  };
  const calls = [];

  function execute(rawSql, params) {
    const sql = squash(rawSql);
    calls.push({ sql, params });

    if (sql.startsWith("SELECT COUNT(*) AS n FROM reviews WHERE status = 'queued'")) {
      return { rows: [{ n: data.reviews.filter((r) => r.status === 'queued').length }], changes: 0 };
    }

    if (sql.startsWith('SELECT status, COUNT(*) AS n FROM reviews GROUP BY status')) {
      const counts = new Map();
      for (const review of data.reviews) {
        counts.set(review.status, (counts.get(review.status) ?? 0) + 1);
      }
      return { rows: [...counts].map(([status, n]) => ({ status, n })), changes: 0 };
    }

    if (sql.includes("FROM reviews WHERE status = 'queued' AND (created_at > ?1")) {
      const [createdAt, id, limit] = params;
      const rows = data.reviews
        .filter((r) => r.status === 'queued')
        .filter((r) => r.created_at > createdAt || (r.created_at === createdAt && r.id > id))
        .sort(byQueueOrder)
        .slice(0, limit);
      return { rows, changes: 0 };
    }

    if (sql.includes("FROM reviews WHERE status = 'queued' ORDER BY")) {
      const [limit] = params;
      const rows = data.reviews.filter((r) => r.status === 'queued').sort(byQueueOrder).slice(0, limit);
      return { rows, changes: 0 };
    }

    if (sql.includes('FROM reviews WHERE id = ?1')) {
      const row = data.reviews.find((r) => r.id === params[0]);
      return { rows: row ? [{ ...row }] : [], changes: 0 };
    }

    if (sql.includes('FROM signals WHERE content_hash IN')) {
      const wanted = new Set(params);
      return { rows: data.signals.filter((s) => wanted.has(s.content_hash)), changes: 0 };
    }

    if (sql.includes('FROM reviewers WHERE telegram_user_id = ?1 AND active = 1')) {
      const row = data.reviewers.find((r) => r.telegram_user_id === params[0] && r.active === 1);
      return { rows: row ? [{ ...row }] : [], changes: 0 };
    }

    if (sql.startsWith('UPDATE reviews SET status = ?1')) {
      const [status, reviewerId, note, reviewId] = params;
      if (!STATUSES.has(status)) throw new Error(`CHECK constraint failed: status ${status}`);
      const review = data.reviews.find((r) => r.id === reviewId && r.status === 'queued');
      if (!review) return { rows: [], changes: 0 };
      if (reviewerId === null || reviewerId === undefined) {
        throw new Error('CHECK constraint failed: a decision needs decided_by');
      }
      if (!data.reviewers.some((r) => r.id === reviewerId)) {
        throw new Error('FOREIGN KEY constraint failed: reviews.decided_by');
      }
      review.status = status;
      review.decided_by = reviewerId;
      review.decided_at = FAKE_NOW;
      review.note = note ?? review.note;
      return { rows: [], changes: 1 };
    }

    if (sql.startsWith("UPDATE reviews SET note = 'sonra")) {
      const [reviewerId, reviewId] = params;
      const review = data.reviews.find((r) => r.id === reviewId && r.status === 'queued');
      if (!review) return { rows: [], changes: 0 };
      review.note = `sonra / skipped by reviewer ${reviewerId} at ${FAKE_NOW}`;
      return { rows: [], changes: 1 };
    }

    if (sql.startsWith('UPDATE reviews SET telegram_message_id = ?1')) {
      const [messageId, reviewId] = params;
      const review = data.reviews.find((r) => r.id === reviewId);
      if (review) review.telegram_message_id = messageId;
      return { rows: [], changes: review ? 1 : 0 };
    }

    throw new Error(`fake D1: unrecognised statement: ${sql}`);
  }

  function statement(sql, params) {
    return {
      bind: (...args) => statement(sql, args),
      first: async () => execute(sql, params).rows[0] ?? null,
      all: async () => ({ results: execute(sql, params).rows, success: true }),
      run: async () => ({ success: true, meta: { changes: execute(sql, params).changes } }),
    };
  }

  return {
    data,
    calls,
    prepare: (sql) => statement(sql, []),
  };
}

function byQueueOrder(a, b) {
  if (a.created_at === b.created_at) return a.id - b.id;
  return a.created_at < b.created_at ? -1 : 1;
}

/** A Telegram API stand-in: records the calls and hands back plausible results. */
export function createFakeTelegramFetch() {
  const calls = [];
  let messageId = 5000;
  const fetchImpl = async (url, init) => {
    const method = String(url).split('/').pop();
    const payload = JSON.parse(init.body);
    calls.push({ method, payload });
    messageId += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: messageId, ...payload } }),
    };
  };
  fetchImpl.calls = calls;
  fetchImpl.sent = () => calls.filter((call) => call.method === 'sendMessage');
  fetchImpl.texts = () => fetchImpl.sent().map((call) => call.payload.text);
  fetchImpl.toasts = () =>
    calls.filter((call) => call.method === 'answerCallbackQuery').map((call) => call.payload.text);
  return fetchImpl;
}

export function makeReview(overrides = {}) {
  return {
    id: 1,
    content_hash: `sha256:${'a'.repeat(64)}`,
    status: 'queued',
    summary_tr: null,
    summary_en: null,
    telegram_message_id: null,
    decided_by: null,
    decided_at: null,
    note: null,
    created_at: '2026-09-15T08:00:00Z',
    ...overrides,
  };
}

export function makeSignal(overrides = {}) {
  return {
    content_hash: `sha256:${'a'.repeat(64)}`,
    url: 'https://example.org/haber/1',
    title: 'Doğu Akdeniz’de ortak tatbikat duyuruldu',
    text: 'İki ülke bakanlığı ortak bir tatbikat takvimi açıkladı.',
    lang: 'tr',
    region: 'dogu-akdeniz',
    triage_score: 0.72,
    published_at: '2026-09-15T07:30:00Z',
    fetched_at: '2026-09-15T08:00:00Z',
    ...overrides,
  };
}

/** A complete, valid environment. Pass `overrides` with `undefined` to drop a secret. */
export function makeEnv({ reviews = [], reviewers = [], signals = [], ...overrides } = {}) {
  const env = {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TELEGRAM_REVIEW_CHAT_ID: String(CHAT_ID),
    TELEGRAM_ALLOWED_USER_IDS: `${REVIEWER_USER_ID}, ${STRANGER_USER_ID}`,
    OPS_DB: createFakeD1({ reviews, reviewers }),
    SIGNALS_DB: createFakeD1({ signals }),
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return env;
}

export function webhookRequest(update, { secret = WEBHOOK_SECRET, method = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (secret !== null) headers['X-Telegram-Bot-Api-Secret-Token'] = secret;
  return new Request('https://review-bot.example.workers.dev/telegram/webhook', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(update) : undefined,
  });
}

export function commandUpdate(text, { userId = REVIEWER_USER_ID, chatId = CHAT_ID } = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: userId, is_bot: false },
      chat: { id: chatId, type: 'group' },
      date: 1_789_000_000,
      text,
    },
  };
}

export function buttonUpdate(data, { userId = REVIEWER_USER_ID, chatId = CHAT_ID } = {}) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cbq-1',
      from: { id: userId, is_bot: false },
      data,
      message: {
        message_id: 42,
        chat: { id: chatId, type: 'group' },
      },
    },
  };
}
