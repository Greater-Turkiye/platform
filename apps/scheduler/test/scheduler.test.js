import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker, { dispatchCollect } from "../src/index.js";

const DISPATCH_URL =
  "https://api.github.com/repos/Greater-Turkiye/platform/actions/workflows/collect.yml/dispatches";

/** A fetch stub that records its calls and never touches the network. */
function stubFetch(response) {
  return vi.fn(async () => response ?? new Response(null, { status: 204 }));
}

function quietLog() {
  return { log: vi.fn(), error: vi.fn() };
}

/** The deployed vars plus whatever the test needs. */
function withEnv(extra = {}) {
  return { ...env, ...extra };
}

describe("dispatch", () => {
  it("posts one workflow_dispatch with the workflow's own inputs", async () => {
    const fetchImpl = stubFetch();
    const log = quietLog();

    const result = await dispatchCollect(withEnv({ GITHUB_DISPATCH_TOKEN: "s3cret" }), { fetchImpl, log });

    expect(result).toEqual({ dispatched: true, reason: "dispatched", status: 204 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(DISPATCH_URL);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer s3cret");
    expect(init.headers.accept).toBe("application/vnd.github+json");
    expect(init.headers["x-github-api-version"]).toBe("2022-11-28");
    expect(init.headers["user-agent"]).toContain("Greater-Turkiye");
    // `dry_run` is left out so the workflow's own default stays in charge.
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { max_items: "40" } });
  });

  it("sends dry_run only when the var asks for it", async () => {
    const fetchImpl = stubFetch();

    await dispatchCollect(withEnv({ GITHUB_DISPATCH_TOKEN: "s3cret", DRY_RUN: "true", MAX_ITEMS: "5" }), {
      fetchImpl,
      log: quietLog(),
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      ref: "main",
      inputs: { max_items: "5", dry_run: true },
    });
  });

  it("dispatches at most once per tick", async () => {
    const fetchImpl = stubFetch(new Response("{}", { status: 500 }));
    const log = quietLog();

    await dispatchCollect(withEnv({ GITHUB_DISPATCH_TOKEN: "s3cret" }), { fetchImpl, log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("without the secret", () => {
  it.each([
    ["missing", {}],
    ["empty", { GITHUB_DISPATCH_TOKEN: "" }],
    ["whitespace", { GITHUB_DISPATCH_TOKEN: "   " }],
  ])("does nothing and says so when the token is %s", async (_name, overrides) => {
    const fetchImpl = stubFetch();
    const log = quietLog();

    const result = await dispatchCollect(withEnv(overrides), { fetchImpl, log });

    expect(result).toEqual({ dispatched: false, reason: "missing-secret", status: 0 });
    // Never an unauthenticated call.
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toContain("GITHUB_DISPATCH_TOKEN");
  });

  it("is what a cron tick does when the Worker has no secret", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await worker.scheduled({ cron: "23 5 * * *", scheduledTime: Date.now() }, withEnv());
      expect(error.mock.calls[0][0]).toContain("GITHUB_DISPATCH_TOKEN");
      expect(logged.mock.calls.at(-1)[0]).toContain("missing-secret");
    } finally {
      error.mockRestore();
      logged.mockRestore();
    }
  });
});

describe("when GitHub refuses", () => {
  it("logs the status and the reason without retrying", async () => {
    const fetchImpl = stubFetch(
      new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), {
        status: 403,
      }),
    );
    const log = quietLog();

    const result = await dispatchCollect(withEnv({ GITHUB_DISPATCH_TOKEN: "s3cret" }), { fetchImpl, log });

    expect(result).toEqual({ dispatched: false, reason: "github-error", status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    const message = log.error.mock.calls[0][0];
    expect(message).toContain("403");
    expect(message).toContain("Resource not accessible");
    expect(message).not.toContain("s3cret");
  });

  it("survives a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("connection refused");
    });
    const log = quietLog();

    const result = await dispatchCollect(withEnv({ GITHUB_DISPATCH_TOKEN: "s3cret" }), { fetchImpl, log });

    expect(result).toEqual({ dispatched: false, reason: "network-error", status: 0 });
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});

describe("the status handler", () => {
  it("answers with the target and no secret", async () => {
    const response = await SELF.fetch("https://scheduler.invalid/health");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.target).toEqual({
      repository: "Greater-Turkiye/platform",
      workflow: "collect.yml",
      ref: "main",
    });
    expect(body.dispatch_token_configured).toBe(false); // no secret in the test environment
    expect(JSON.stringify(body)).not.toContain("GITHUB_DISPATCH_TOKEN");
  });

  it("has no write endpoint", async () => {
    const response = await SELF.fetch("https://scheduler.invalid/health", { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("answers 404 anywhere else", async () => {
    const response = await SELF.fetch("https://scheduler.invalid/dispatch");
    expect(response.status).toBe(404);
  });
});
