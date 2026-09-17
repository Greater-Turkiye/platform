// Test doubles for the two files this Worker reads, and a fetch stand-in that serves them.
//
// Nothing here is a credential: this Worker has none. The only thing being faked is a public
// HTTPS host, and the digest in every pointer is computed the same way the Worker checks it, so a
// test that changes a batch without changing its pointer fails for the right reason.

import { env } from "cloudflare:test";
import { vi } from "vitest";

export const BASE = env.BATCH_BASE_URL;
export const POINTER_URL = `${BASE}latest.json`;
export const BATCH_ID = "2026-09-16-18234567890";

export function hash(n) {
  return `sha256:${String(n).padStart(2, "0").repeat(32).slice(0, 64)}`;
}

/** One published row: the sixteen `signals` columns, exactly as the collector publishes them. */
export function makeRow(n = 1, overrides = {}) {
  return {
    content_hash: hash(n),
    simhash: "a4f0c1d2e3b45678",
    raw_hash: hash(n + 50),
    source_id: "src_01m2bez3g6fgwb9nhs14271a8f",
    collector_id: "rss-test",
    url: `https://news.example.org/item/${n}`,
    lang: "en",
    title: `Synthetic item ${n}`,
    text: `Synthetic text number ${n}.`,
    region: "aegean",
    geo_json: null,
    published_at: "2026-09-16T04:10:00Z",
    fetched_at: "2026-09-16T05:23:00Z",
    triage_status: "queued",
    triage_score: 0.75,
    triage_labels: '{"feed":"rss-test"}',
    ...overrides,
  };
}

export function makeBatch(rows, overrides = {}) {
  return {
    schema: "gt.collector.batch/1",
    batch_id: BATCH_ID,
    created_at: "2026-09-16T05:23:11Z",
    run_url: "https://github.com/Greater-Turkiye/platform/actions/runs/18234567890",
    counts: { rows: rows.length, reviews: 0, truncated: 0, by_triage_status: {} },
    rows,
    ...overrides,
  };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makePointer(batchBody, overrides = {}) {
  const parsed = JSON.parse(batchBody);
  return {
    schema: "gt.collector.batch-pointer/1",
    batch_id: parsed.batch_id,
    file: `${parsed.batch_id}.json`,
    sha256: await sha256Hex(batchBody),
    rows: parsed.rows.length,
    created_at: parsed.created_at,
    ...overrides,
  };
}

/**
 * A fetch stub serving one pointer and one batch, and 404 for anything else. It records every URL
 * it was asked for, so a test can prove the Worker never went anywhere it was not configured to.
 */
export function serve({ pointer, batch, batchBody, pointerBody, status = 200, headers = {} }) {
  const bodies = new Map();
  if (pointerBody !== undefined) bodies.set(POINTER_URL, pointerBody);
  else if (pointer !== undefined) bodies.set(POINTER_URL, `${JSON.stringify(pointer)}\n`);
  const body = batchBody ?? (batch === undefined ? undefined : `${JSON.stringify(batch)}\n`);
  if (body !== undefined) {
    const name = (pointer ?? JSON.parse(bodies.get(POINTER_URL) ?? "{}"))?.file ?? `${BATCH_ID}.json`;
    bodies.set(`${BASE}${name}`, body);
  }

  const fetchImpl = vi.fn(async (url) => {
    fetchImpl.urls.push(String(url));
    const found = bodies.get(String(url));
    if (found === undefined) return new Response("not found", { status: 404 });
    return new Response(found, { status, headers: { "content-type": "application/json", ...headers } });
  });
  fetchImpl.urls = [];
  return fetchImpl;
}

/** A pointer plus a matching batch, ready to serve. */
export async function published(rows, { batch: overrides = {}, pointer: pointerOverrides = {} } = {}) {
  const batchBody = `${JSON.stringify(makeBatch(rows, overrides))}\n`;
  const pointer = await makePointer(batchBody, pointerOverrides);
  return { batchBody, pointer, fetchImpl: serve({ pointer, batchBody }) };
}

export function quietLog() {
  return { log: vi.fn(), error: vi.fn() };
}

export async function count(db, table) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
  return row.n;
}

export async function collectorState() {
  return env.OPS_DB.prepare("SELECT * FROM collector_state WHERE collector_id = 'gt-ingest'").first();
}
