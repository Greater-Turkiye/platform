// ingest — the Worker that pulls the collector's published batches into D1.
//
//   Cloudflare cron tick
//     -> GET …/collector-state/collectors/state/batches/latest.json   (the pointer)
//     -> GET …/collector-state/collectors/state/batches/<batch>.json  (the rows)
//     -> INSERT … ON CONFLICT DO NOTHING into gt-signals.signals
//     -> INSERT … ON CONFLICT DO NOTHING into gt-ops.reviews          (queued candidates only)
//     -> UPSERT gt-ops.collector_state                                (the cursor)
//
// **Why it pulls instead of being pushed to.** Writing to D1 from GitHub Actions needs a
// `CLOUDFLARE_API_TOKEN` repository secret: a credential that has to be created, stored and
// rotated by a human, and that lives outside Cloudflare. This Worker runs inside the account that
// owns both databases, so its D1 bindings are the authorisation. The collector run publishes its
// batch to the `collector-state` branch of a public repository, this Worker reads it over public
// HTTPS, and no secret exists on either side of the hand-off. That is the whole point: the
// deployment step is `wrangler deploy` and nothing else.
//
// **What it does not do.** It has no public write endpoint. The `fetch` handler answers a status
// question and nothing more: no collected data, no secret, no way to make it ingest anything. The
// cron tick is the only thing that writes, and it can only ever write what the repository
// published.
//
// **Trust.** The published file is untrusted input (src/batch.js): every field is checked against
// the `signals` schema, the row count is capped, and anything that does not match is refused
// whole rather than partially inserted. Nothing the Turkish-forces safety filter or the geofence
// dropped can be in the file — the run filters before publishing — and this Worker cannot put
// back what is not there.

import {
  BatchError,
  COLUMNS,
  MAX_BATCH_BYTES,
  MAX_POINTER_BYTES,
  MAX_ROWS,
  parseBatch,
  parsePointer,
  reviewRows,
} from "./batch.js";

/** The `ops.collector_state` row this Worker owns. Its `cursor` is the last batch id processed. */
const COLLECTOR_ID = "gt-ingest";
const USER_AGENT = "Greater-Turkiye-ingest (+https://github.com/Greater-Turkiye/platform)";
const POINTER_FILE = "latest.json";

/** Rows per INSERT batch, like the push writer: short statements, small failures. */
const INSERT_BATCH = 25;
/**
 * Rows this Worker is willing to write in one tick, counting index entries (db/README.md: an
 * insert costs about three). At the row cap that is 6,000 of the free plan's 100,000 a day.
 */
const WRITE_BUDGET = 20_000;
const WRITES_PER_ROW = 3;

/** Most characters of a refusal we keep. `collector_state.last_error` allows 1,000. */
const MAX_ERROR = 500;

const SIGNAL_SQL = `INSERT INTO signals (${COLUMNS.join(", ")})
VALUES (?, CAST(? AS INTEGER), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(content_hash) DO NOTHING`;

const REVIEW_SQL = `INSERT INTO reviews (content_hash) VALUES (?)
ON CONFLICT(content_hash) DO NOTHING`;

const STATE_SELECT = `SELECT cursor, last_run_at, last_success_at, consecutive_failures
FROM collector_state WHERE collector_id = ?`;

// One statement for every good tick, whether or not there was a batch to take. `COALESCE` is what
// makes a quiet tick safe: a tick that found no pointer binds NULL and keeps the cursor it had,
// instead of forgetting which batch was last processed and ingesting it all over again.
const STATE_SUCCESS = `INSERT INTO collector_state
  (collector_id, enabled, last_run_at, last_success_at, cursor, consecutive_failures, last_error)
VALUES (?, 1, ?, ?, ?, 0, NULL)
ON CONFLICT(collector_id) DO UPDATE SET
  enabled = 1,
  last_run_at = excluded.last_run_at,
  last_success_at = excluded.last_success_at,
  cursor = COALESCE(excluded.cursor, collector_state.cursor),
  consecutive_failures = 0,
  last_error = NULL`;

const STATE_FAILURE = `INSERT INTO collector_state
  (collector_id, enabled, last_run_at, consecutive_failures, last_error)
VALUES (?, 1, ?, 1, ?)
ON CONFLICT(collector_id) DO UPDATE SET
  last_run_at = excluded.last_run_at,
  consecutive_failures = collector_state.consecutive_failures + 1,
  last_error = excluded.last_error`;

/** Public configuration only; there is no secret to read. */
export function settings(env) {
  const base =
    env.BATCH_BASE_URL ??
    "https://raw.githubusercontent.com/Greater-Turkiye/platform/collector-state/collectors/state/batches/";
  if (!base.startsWith("https://") || !base.endsWith("/")) {
    throw new BatchError("BATCH_BASE_URL must be an https URL ending in '/'", "config");
  }
  const maxRows = clamp(env.MAX_ROWS_PER_TICK, MAX_ROWS, 1, MAX_ROWS);
  return {
    base,
    pointerUrl: `${base}${POINTER_FILE}`,
    maxRows,
    insertBatch: clamp(env.INSERT_BATCH, INSERT_BATCH, 1, 100),
    writeBudget: clamp(env.WRITE_BUDGET, WRITE_BUDGET, WRITES_PER_ROW, 100_000),
  };
}

function clamp(value, fallback, low, high) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(high, Math.max(low, parsed));
}

function stamp(date) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * Fetch one published file. The URL is always built here from the configured base plus a name the
 * pointer validator has already constrained, so nothing in a file can redirect this anywhere:
 * `redirect: "manual"` (workerd does not implement "error") plus the 3xx check below refuses even a
 * redirect from the host itself.
 */
async function fetchFile(url, { fetchImpl, maxBytes }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      redirect: "manual",
      cf: { cacheTtl: 0 },
    });
  } catch (error) {
    throw new BatchError(`could not reach the batch host: ${error?.name ?? "error"}`, "unreachable");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new BatchError("batch host tried to redirect this Worker", "unreachable");
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new BatchError(`batch host answered HTTP ${response.status}`, "unreachable");

  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isSafeInteger(declared) && declared > maxBytes) {
    throw new BatchError("published file is larger than this Worker will read", "too-large");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new BatchError("published file is larger than this Worker will read", "too-large");
  }
  let body;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new BatchError("published file is not valid UTF-8", "not-utf8");
  }
  return { body, digest: await sha256Hex(buffer) };
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function* chunks(items, size) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/**
 * One tick's work, once the batch has been validated.
 *
 * Signals first, reviews second — never the other way round, for the reason the push writer gives:
 * a review whose signal is missing renders in the bot as a candidate with no source link. Both
 * inserts are `ON CONFLICT DO NOTHING`, so replaying a batch writes nothing, changes no triage
 * status and cannot reopen an item a reviewer has already decided.
 */
async function store(env, rows, { insertBatch }) {
  let batches = 0;
  for (const chunk of chunks(rows, insertBatch)) {
    await env.SIGNALS_DB.batch(
      chunk.map((row) => env.SIGNALS_DB.prepare(SIGNAL_SQL).bind(...COLUMNS.map((c) => row[c]))),
    );
    batches += 1;
  }
  const reviews = reviewRows(rows);
  for (const chunk of chunks(reviews, insertBatch)) {
    await env.OPS_DB.batch(chunk.map((hash) => env.OPS_DB.prepare(REVIEW_SQL).bind(hash)));
    batches += 1;
  }
  return { rows: rows.length, reviews: reviews.length, batches };
}

async function readState(env) {
  try {
    return await env.OPS_DB.prepare(STATE_SELECT).bind(COLLECTOR_ID).first();
  } catch {
    return null;
  }
}

async function recordSuccess(env, { at, cursor }) {
  await env.OPS_DB.prepare(STATE_SUCCESS).bind(COLLECTOR_ID, at, at, cursor).run();
}

async function recordFailure(env, { at, detail }) {
  await env.OPS_DB.prepare(STATE_FAILURE).bind(COLLECTOR_ID, at, detail.slice(0, MAX_ERROR)).run();
}

/**
 * Read the pointer, and the newest batch it names if this Worker has not processed it yet.
 *
 * De-duplication is the cursor in `ops.collector_state`: a tick whose pointer names the batch id
 * already recorded there does no work at all. Should the cursor ever be lost, the `ON CONFLICT`
 * clauses make reprocessing the same batch a no-op anyway, so the two defences are independent.
 */
export async function ingestOnce(env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? console;
  const now = deps.now ?? (() => new Date());
  const at = stamp(now());

  let config;
  try {
    config = settings(env);
  } catch (error) {
    log.error(`ingest: ${error.message}`);
    return { ok: false, reason: "config", detail: error.message };
  }

  try {
    const result = await pull(env, config, { fetchImpl, at });
    if (result.reason === "ingested") {
      log.log(
        `ingest: batch ${result.batchId} -> ${result.rows} signal row(s), ${result.reviews} review row(s), ` +
          `${result.duplicates} duplicate line(s) in the file, ~${result.rowsWritten} rows written`,
      );
    } else {
      log.log(`ingest: nothing to do (${result.reason})`);
    }
    await recordSuccess(env, { at, cursor: result.batchId ?? null });
    return { ok: true, ...result };
  } catch (error) {
    const detail = error instanceof BatchError ? error.message : `${error?.name ?? "Error"}`;
    const reason = error instanceof BatchError ? error.reason : "error";
    // Loud, but with no candidate and no value in it: this string is stored and read in logs.
    log.error(`ingest: refused this tick (${reason}): ${detail}`);
    try {
      await recordFailure(env, { at, detail: `${reason}: ${detail}` });
    } catch {
      log.error("ingest: could not record the failure in ops.collector_state");
    }
    return { ok: false, reason, detail };
  }
}

async function pull(env, config, { fetchImpl, at }) {
  const pointerFile = await fetchFile(config.pointerUrl, { fetchImpl, maxBytes: MAX_POINTER_BYTES });
  if (pointerFile === null) return { reason: "no-pointer", batchId: null };

  const pointer = parsePointer(pointerFile.body);
  const state = await readState(env);
  if (state?.cursor === pointer.batchId) return { reason: "up-to-date", batchId: pointer.batchId };
  if (pointer.rows > config.maxRows) {
    throw new BatchError("pointer announces more rows than one tick may write", "too-many-rows");
  }

  const batchFile = await fetchFile(`${config.base}${pointer.file}`, {
    fetchImpl,
    maxBytes: MAX_BATCH_BYTES,
  });
  if (batchFile === null) throw new BatchError("the pointer names a batch that is not there", "missing");
  if (batchFile.digest !== pointer.sha256) {
    throw new BatchError("batch digest does not match the pointer", "digest");
  }

  const batch = parseBatch(batchFile.body, pointer, { maxRows: config.maxRows });
  const estimate = batch.rows.length * WRITES_PER_ROW + reviewRows(batch.rows).length * WRITES_PER_ROW;
  if (estimate > config.writeBudget) {
    throw new BatchError("batch would cost more rows written than one tick allows", "write-budget");
  }

  const written = await store(env, batch.rows, config);
  return {
    reason: "ingested",
    batchId: batch.batchId,
    duplicates: batch.duplicates,
    rowsWritten: estimate,
    processedAt: at,
    ...written,
  };
}

/** Public status: what this Worker is and how far it has got. No collected data, no secret. */
async function health(env) {
  let config = null;
  let configError = null;
  try {
    config = settings(env);
  } catch (error) {
    configError = error.message;
  }
  const state = config === null ? null : await readState(env);
  return {
    service: "gt-ingest",
    role: "pulls published collector batches from the repository into D1",
    // The deployment story in one field: there is nothing to put in the secret store.
    secrets_required: [],
    source: config === null ? { error: configError } : { pointer: config.pointerUrl },
    limits:
      config === null
        ? null
        : {
            max_rows_per_tick: config.maxRows,
            rows_per_insert: config.insertBatch,
            max_batch_bytes: MAX_BATCH_BYTES,
            write_budget_rows: config.writeBudget,
          },
    // Counters and one batch id — never a candidate, a title or a URL.
    state: state
      ? {
          last_batch: state.cursor,
          last_run_at: state.last_run_at,
          last_success_at: state.last_success_at,
          consecutive_failures: state.consecutive_failures,
        }
      : { last_batch: null },
    time: new Date().toISOString(),
  };
}

export default {
  /** Status only. There is no endpoint that ingests, and none that writes. */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
    }
    if (pathname !== "/" && pathname !== "/health") return json({ error: "not found" }, 404);
    return json(await health(env), 200);
  },

  /** One cron tick, at most one batch. */
  async scheduled(controller, env) {
    const result = await ingestOnce(env);
    console.log(
      `ingest: tick ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()} -> ${result.reason}`,
    );
  },
};

function json(value, status, headers = {}) {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
