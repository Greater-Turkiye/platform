// The two sides of the hand-off, checked against each other.
//
// `test/fixtures/` is the real output of `gt-collect --publish-batch` (the Python publisher in
// collectors/src/gt_collectors/batch.py), copied in byte for byte. If either side changes its
// idea of the format — a renamed field, a different simhash encoding, a stricter pattern — this
// test fails instead of the pipeline going quiet in production.
//
// The run that produced the fixture also collected a signal inside the Türkiye geofence. It is
// not in the file, and the test below says so: the red line holds across the hand-off, not only
// inside the collector.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { parseBatch, parsePointer, reviewRows } from "../src/batch.js";
import { ingestOnce } from "../src/index.js";
import batchJson from "./fixtures/2026-09-16-18234567890.json";
import pointerJson from "./fixtures/latest.json";
import { BASE, POINTER_URL, count, quietLog } from "./helpers.js";

// Imported as parsed JSON and serialised again, so the digest is recomputed from what is here.
const batchBody = JSON.stringify(batchJson);
const pointerBody = JSON.stringify({ ...pointerJson, sha256: await digest(batchBody) });

async function digest(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function serveFixture() {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    if (String(url) === POINTER_URL) return new Response(pointerBody);
    if (String(url) === `${BASE}${pointerJson.file}`) return new Response(batchBody);
    return new Response("not found", { status: 404 });
  };
  fetchImpl.urls = urls;
  return fetchImpl;
}

beforeEach(async () => {
  await env.SIGNALS_DB.prepare("DELETE FROM signals").run();
  await env.OPS_DB.prepare("DELETE FROM reviews").run();
  await env.OPS_DB.prepare("DELETE FROM collector_state").run();
});

describe("a batch the Python publisher really wrote", () => {
  it("parses with no adjustment on this side", () => {
    const pointer = parsePointer(pointerBody);
    const batch = parseBatch(batchBody, pointer);

    expect(pointer.batchId).toBe("2026-09-16-18234567890");
    expect(batch.rows).toHaveLength(3);
    expect(batch.rows.map((r) => r.triage_status).sort()).toEqual(["pending", "queued", "scored"]);
    expect(reviewRows(batch.rows)).toHaveLength(1);
  });

  it("carries the sixteen signals columns and a hex simhash, and nothing else", () => {
    const [row] = batchJson.rows;
    expect(Object.keys(row)).toHaveLength(16);
    expect(row.simhash).toMatch(/^[0-9a-f]{16}$/u);
    expect(row.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(row).not.toHaveProperty("archive_url");
    expect(row).not.toHaveProperty("relevance");
  });

  it("holds nothing the safety filter dropped", () => {
    // The run collected four candidates; one had a position inside the geofence.
    expect(batchJson.counts.rows).toBe(3);
    expect(JSON.stringify(batchJson)).not.toContain("item/4");
  });

  it("goes into both databases in one tick", async () => {
    const result = await ingestOnce(env, { fetchImpl: serveFixture(), log: quietLog() });

    expect(result).toMatchObject({ ok: true, reason: "ingested", rows: 3, reviews: 1 });
    expect(await count(env.SIGNALS_DB, "signals")).toBe(3);
    expect(await count(env.OPS_DB, "reviews")).toBe(1);

    const stored = await env.SIGNALS_DB.prepare(
      "SELECT * FROM signals WHERE triage_status = 'queued'",
    ).first();
    expect(stored.collector_id).toBe("rss-un-news");
    expect(JSON.parse(stored.triage_labels).feed).toBe("rss-un-news");
  });
});
