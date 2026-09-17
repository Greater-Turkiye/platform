// A tick, end to end, against the real schema in a local D1. No credential, no network: the two
// published files are served by an injected fetch, and the databases are built from
// `db/migrations` in test/apply-migrations.js.

import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker, { ingestOnce } from "../src/index.js";
import {
  BASE,
  BATCH_ID,
  POINTER_URL,
  collectorState,
  count,
  hash,
  makeBatch,
  makePointer,
  makeRow,
  published,
  quietLog,
  serve,
  sha256Hex,
} from "./helpers.js";

const now = () => new Date("2026-09-16T06:00:00.000Z");

function run(fetchImpl, overrides = {}) {
  return ingestOnce({ ...env, ...overrides }, { fetchImpl, log: quietLog(), now });
}

beforeEach(async () => {
  // Isolated storage gives each test its own copy, but be explicit about the starting point.
  await env.SIGNALS_DB.prepare("DELETE FROM signals").run();
  await env.OPS_DB.prepare("DELETE FROM reviews").run();
  await env.OPS_DB.prepare("DELETE FROM collector_state").run();
});

describe("a tick with a new batch", () => {
  it("writes the signals, then only the queued candidates as reviews", async () => {
    const rows = [
      makeRow(1, { triage_status: "queued" }),
      makeRow(2, { triage_status: "pending" }),
      makeRow(3, { triage_status: "scored" }),
    ];
    const { fetchImpl } = await published(rows);

    const result = await run(fetchImpl);

    expect(result).toMatchObject({ ok: true, reason: "ingested", batchId: BATCH_ID, rows: 3, reviews: 1 });
    expect(await count(env.SIGNALS_DB, "signals")).toBe(3);
    expect(await count(env.OPS_DB, "reviews")).toBe(1);

    const review = await env.OPS_DB.prepare("SELECT * FROM reviews").first();
    expect(review.content_hash).toBe(hash(1));
    expect(review.status).toBe("queued");
    // The reviewer's and the bot's columns are left alone.
    expect(review.summary_tr).toBeNull();
    expect(review.decided_by).toBeNull();
  });

  it("stores the columns the schema expects, including the full 64-bit simhash", async () => {
    const { fetchImpl } = await published([makeRow(1, { simhash: "ffffffffffffffff" })]);

    await run(fetchImpl);

    const row = await env.SIGNALS_DB.prepare("SELECT * FROM signals").first();
    expect(row.content_hash).toBe(hash(1));
    expect(row.collector_id).toBe("rss-test");
    expect(row.triage_status).toBe("queued");
    expect(row.triage_score).toBeCloseTo(0.75);
    expect(String(row.simhash)).toBe("-1");
    // `created_at` is the database's, so a replayed batch cannot shift it.
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  });

  it("reads the pointer and exactly one batch, and nothing else", async () => {
    const { fetchImpl } = await published([makeRow(1)]);

    await run(fetchImpl);

    expect(fetchImpl.urls).toEqual([POINTER_URL, `${BASE}${BATCH_ID}.json`]);
  });

  it("records the batch it processed in ops.collector_state", async () => {
    const { fetchImpl } = await published([makeRow(1)]);

    await run(fetchImpl);

    const state = await collectorState();
    expect(state.cursor).toBe(BATCH_ID);
    expect(state.consecutive_failures).toBe(0);
    expect(state.last_error).toBeNull();
    expect(state.last_success_at).toBe("2026-09-16T06:00:00Z");
  });

  it("splits a large batch into several INSERTs", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => makeRow(i + 10));
    const { fetchImpl } = await published(rows);

    const result = await run(fetchImpl, { INSERT_BATCH: "25" });

    expect(result.rows).toBe(60);
    expect(result.batches).toBe(3 + 3); // 60 signals and 60 reviews, 25 at a time
    expect(await count(env.SIGNALS_DB, "signals")).toBe(60);
  });
});

describe("running the same batch again", () => {
  it("is a no-op: the cursor says it is done", async () => {
    const { fetchImpl } = await published([makeRow(1), makeRow(2)]);

    await run(fetchImpl);
    const second = await run(fetchImpl);

    expect(second).toMatchObject({ ok: true, reason: "up-to-date", batchId: BATCH_ID });
    expect(await count(env.SIGNALS_DB, "signals")).toBe(2);
    expect(await count(env.OPS_DB, "reviews")).toBe(2);
    // The second tick never asked for the batch file at all.
    expect(fetchImpl.urls.filter((url) => url.endsWith(`${BATCH_ID}.json`))).toHaveLength(1);
  });

  it("is still a no-op if the cursor is lost, because every insert is ON CONFLICT DO NOTHING", async () => {
    const { fetchImpl } = await published([makeRow(1), makeRow(2)]);

    await run(fetchImpl);
    await env.OPS_DB.prepare("UPDATE collector_state SET cursor = NULL").run();
    const second = await run(fetchImpl);

    expect(second.reason).toBe("ingested");
    expect(await count(env.SIGNALS_DB, "signals")).toBe(2);
    expect(await count(env.OPS_DB, "reviews")).toBe(2);
  });

  it("cannot undo a decision a reviewer has already made", async () => {
    const { fetchImpl } = await published([makeRow(1)]);
    await run(fetchImpl);

    await env.OPS_DB.prepare(
      "INSERT INTO reviewers (id, telegram_user_id, role) VALUES (1, 900000001, 'maintainer')",
    ).run();
    await env.OPS_DB.prepare(
      "UPDATE reviews SET status='dismissed', decided_by=1, decided_at='2026-09-16T07:00:00Z'",
    ).run();
    await env.OPS_DB.prepare("UPDATE collector_state SET cursor = NULL").run();

    await run(fetchImpl);

    const review = await env.OPS_DB.prepare("SELECT * FROM reviews").first();
    expect(review.status).toBe("dismissed");
    expect(review.decided_by).toBe(1);
    expect(await count(env.OPS_DB, "reviews")).toBe(1);
  });

  it("does not forget the cursor on a quiet tick with nothing published", async () => {
    const { fetchImpl } = await published([makeRow(1)]);
    await run(fetchImpl);

    const empty = serve({});
    const result = await run(empty);

    expect(result).toMatchObject({ ok: true, reason: "no-pointer" });
    expect((await collectorState()).cursor).toBe(BATCH_ID);
  });
});

describe("a batch it refuses", () => {
  async function refuse(files) {
    const result = await run(serve(files));
    expect(result.ok).toBe(false);
    expect(await count(env.SIGNALS_DB, "signals")).toBe(0);
    expect(await count(env.OPS_DB, "reviews")).toBe(0);
    return result;
  }

  it("writes nothing when the pointer is not JSON", async () => {
    expect((await refuse({ pointerBody: "<html>404</html>" })).reason).toBe("not-json");
  });

  it("writes nothing when the pointer names a batch that is not there", async () => {
    const pointer = await makePointer(`${JSON.stringify(makeBatch([makeRow(1)]))}\n`);
    expect((await refuse({ pointer })).reason).toBe("missing");
  });

  it("writes nothing when the batch does not hash to what the pointer says", async () => {
    const batchBody = `${JSON.stringify(makeBatch([makeRow(1)]))}\n`;
    const pointer = await makePointer(batchBody, { sha256: "0".repeat(64) });
    expect((await refuse({ pointer, batchBody })).reason).toBe("digest");
  });

  it("writes nothing when one row in an otherwise valid batch is malformed", async () => {
    const rows = [makeRow(1), makeRow(2, { url: "javascript:alert(1)" }), makeRow(3)];
    const batchBody = `${JSON.stringify(makeBatch(rows))}\n`;
    const pointer = await makePointer(batchBody);

    // All or nothing: the two good rows are not written either.
    await refuse({ pointer, batchBody });
  });

  it("writes nothing when the batch announces more rows than a tick may take", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i + 1));
    const batchBody = `${JSON.stringify(makeBatch(rows))}\n`;
    const pointer = await makePointer(batchBody);

    const result = await ingestOnce(
      { ...env, MAX_ROWS_PER_TICK: "2" },
      { fetchImpl: serve({ pointer, batchBody }), log: quietLog(), now },
    );

    expect(result).toMatchObject({ ok: false, reason: "too-many-rows" });
    expect(await count(env.SIGNALS_DB, "signals")).toBe(0);
  });

  it("writes nothing when the batch would cost more than the tick's write budget", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i + 1));
    const batchBody = `${JSON.stringify(makeBatch(rows))}\n`;
    const pointer = await makePointer(batchBody);

    const result = await ingestOnce(
      { ...env, WRITE_BUDGET: "6" },
      { fetchImpl: serve({ pointer, batchBody }), log: quietLog(), now },
    );

    expect(result).toMatchObject({ ok: false, reason: "write-budget" });
    expect(await count(env.SIGNALS_DB, "signals")).toBe(0);
  });

  it("survives the host being unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("connection refused");
    });

    const result = await run(fetchImpl);

    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("counts the failure and keeps the reason, with no candidate in it", async () => {
    const { fetchImpl } = await published([makeRow(1)]);
    await run(fetchImpl);

    await run(serve({ pointerBody: "<html>404</html>" }));
    await run(serve({ pointerBody: "<html>404</html>" }));

    const state = await collectorState();
    expect(state.consecutive_failures).toBe(2);
    expect(state.last_error).toContain("not-json");
    expect(state.last_error.length).toBeLessThanOrEqual(1000);
    // A failed tick never moves the cursor: the good batch is still the last one processed.
    expect(state.cursor).toBe(BATCH_ID);
  });

  it("clears the failure counter once a tick works again", async () => {
    await run(serve({ pointerBody: "nonsense" }));
    const { fetchImpl } = await published([makeRow(1)]);

    await run(fetchImpl);

    expect((await collectorState()).consecutive_failures).toBe(0);
  });

  it("refuses to run at all if it is pointed at something that is not https", async () => {
    const result = await run(serve({}), { BATCH_BASE_URL: "http://raw.example.org/batches/" });
    expect(result).toMatchObject({ ok: false, reason: "config" });
  });
});

describe("the redirect guard", () => {
  it("asks for no redirects to be followed, so no file can send it to another host", async () => {
    const { fetchImpl } = await published([makeRow(1)]);

    await run(fetchImpl);

    for (const [, init] of fetchImpl.mock.calls) expect(init.redirect).toBe("manual");
  });

  it("refuses a 3xx from the host instead of following it", async () => {
    const result = await run(serve({ pointerBody: "{}
", status: 302 }));

    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
  });
});

describe("the cron tick", () => {
  it("is what the scheduled handler runs", async () => {
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await worker.scheduled({ cron: "53 5,17 * * *", scheduledTime: Date.now() }, env);
      expect(logged.mock.calls.at(-1)[0]).toContain("ingest: tick");
    } finally {
      logged.mockRestore();
    }
  });
});

describe("the status handler", () => {
  it("answers with what it reads and how far it has got, and no collected data", async () => {
    const { fetchImpl } = await published([makeRow(1)]);
    await run(fetchImpl);

    const response = await SELF.fetch("https://ingest.invalid/health");
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.service).toBe("gt-ingest");
    expect(body.secrets_required).toEqual([]);
    expect(body.source.pointer).toBe(POINTER_URL);
    expect(body.state.last_batch).toBe(BATCH_ID);
    const text = JSON.stringify(body);
    expect(text).not.toContain("news.example.org");
    expect(text).not.toContain("Synthetic item");
  });

  it("has no write endpoint", async () => {
    expect((await SELF.fetch("https://ingest.invalid/health", { method: "POST" })).status).toBe(405);
    expect((await SELF.fetch("https://ingest.invalid/ingest", { method: "POST" })).status).toBe(405);
  });

  it("answers 404 anywhere else", async () => {
    expect((await SELF.fetch("https://ingest.invalid/ingest")).status).toBe(404);
  });
});

describe("the deployment claim", () => {
  it("needs no secret: the whole configuration is public vars and D1 bindings", () => {
    const names = Object.keys(env).filter((key) => /TOKEN|SECRET|KEY|PASSWORD/iu.test(key));
    expect(names).toEqual([]);
    expect(env.SIGNALS_DB).toBeDefined();
    expect(env.OPS_DB).toBeDefined();
  });
});

describe("the sha256 helper agrees with the Worker", () => {
  it("hashes the bytes of the published file", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
