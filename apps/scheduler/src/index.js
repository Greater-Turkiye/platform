// scheduler — the cron trigger for the collector run (ADR 0008).
//
//   Cloudflare cron tick -> POST /actions/workflows/collect.yml/dispatches -> the collect job
//
// Why a Worker instead of GitHub's own `schedule:`: scheduled workflows in a public repository
// are disabled after 60 days without repository activity, and they run late at busy times.
// ADR 0016 put the collectors on `schedule:` until this Worker existed; moving the trigger over
// is a separate decision (see apps/scheduler/README.md).
//
// This Worker only asks GitHub to start a workflow. It stores nothing, reads no collected data,
// publishes nothing, and has no endpoint that writes anything.

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "Greater-Turkiye-scheduler (+https://github.com/Greater-Turkiye/platform)";
const API_VERSION = "2022-11-28";

/** Most characters of a GitHub error body we are willing to put in the log. */
const MAX_LOGGED_BODY = 400;

/**
 * Settings the dispatch needs, read from `vars` in wrangler.jsonc and from the secret store.
 * Everything except the token is public configuration.
 */
function settings(env) {
  return {
    repository: env.TARGET_REPOSITORY ?? "Greater-Turkiye/platform",
    workflow: env.TARGET_WORKFLOW ?? "collect.yml",
    ref: env.TARGET_REF ?? "main",
    maxItems: String(env.MAX_ITEMS ?? "40"),
    dryRun: String(env.DRY_RUN ?? "false") === "true",
  };
}

/**
 * The inputs `collect.yml` declares. Only inputs the workflow knows are sent: GitHub answers 422
 * to an unexpected one, which would stop the run entirely.
 */
function dispatchBody(config) {
  const inputs = { max_items: config.maxItems };
  // `dry_run` is a boolean input; it is only sent when it is on, so the workflow default (false)
  // stays in charge otherwise.
  if (config.dryRun) inputs.dry_run = true;
  return { ref: config.ref, inputs };
}

/**
 * Ask GitHub to run the collector workflow once.
 *
 * One tick, at most one request: nothing here retries. A failed tick is logged and the next cron
 * tick tries again, so a GitHub outage can never turn into a retry loop against the API.
 *
 * @param {Record<string, unknown>} env Worker environment (vars + secrets).
 * @param {{fetchImpl?: typeof fetch, log?: Pick<Console, "log"|"error">}} [deps] Injected for tests.
 * @returns {Promise<{dispatched: boolean, reason: string, status: number}>}
 */
export async function dispatchCollect(env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? console;
  const config = settings(env);
  const target = `${config.repository} ${config.workflow}@${config.ref}`;

  const token = typeof env.GITHUB_DISPATCH_TOKEN === "string" ? env.GITHUB_DISPATCH_TOKEN.trim() : "";
  if (token === "") {
    // Loud and final. An unauthenticated dispatch is not attempted: it cannot succeed, and a
    // quiet no-op would hide a broken pipeline for days.
    log.error(
      "scheduler: GITHUB_DISPATCH_TOKEN is missing or empty — no dispatch. " +
        "Set it with: wrangler secret put GITHUB_DISPATCH_TOKEN",
    );
    return { dispatched: false, reason: "missing-secret", status: 0 };
  }

  const url = `${GITHUB_API}/repos/${config.repository}/actions/workflows/${config.workflow}/dispatches`;
  const body = JSON.stringify(dispatchBody(config));

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        "x-github-api-version": API_VERSION,
      },
      body,
    });
  } catch (error) {
    log.error(`scheduler: dispatch to ${target} failed to reach GitHub: ${error}`);
    return { dispatched: false, reason: "network-error", status: 0 };
  }

  if (response.status === 204) {
    log.log(`scheduler: dispatched ${target} with ${body}`);
    return { dispatched: true, reason: "dispatched", status: 204 };
  }

  log.error(
    `scheduler: GitHub refused the dispatch of ${target} with HTTP ${response.status} ` +
      `(${await briefly(response)}) — not retrying before the next tick`,
  );
  return { dispatched: false, reason: "github-error", status: response.status };
}

/** A short, safe excerpt of an error response; never throws, never logs a secret. */
async function briefly(response) {
  try {
    const text = await response.text();
    return text.slice(0, MAX_LOGGED_BODY).replace(/\s+/g, " ").trim() || "empty body";
  } catch {
    return "unreadable body";
  }
}

/** Public status, with no secret and no collected data in it. */
function health(env) {
  const config = settings(env);
  return {
    service: "gt-scheduler",
    role: "cron trigger for the collector workflow",
    target: {
      repository: config.repository,
      workflow: config.workflow,
      ref: config.ref,
    },
    inputs: { max_items: config.maxItems, dry_run: config.dryRun },
    // Whether the secret exists, never any part of its value.
    dispatch_token_configured: typeof env.GITHUB_DISPATCH_TOKEN === "string" && env.GITHUB_DISPATCH_TOKEN.trim() !== "",
    time: new Date().toISOString(),
  };
}

export default {
  /**
   * Status only. There is no endpoint that dispatches, writes or reads collected data: the cron
   * tick is the only thing that can start a run.
   */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
    }
    if (pathname !== "/" && pathname !== "/health") {
      return json({ error: "not found" }, 404);
    }
    return json(health(env), 200);
  },

  /** One cron tick, one dispatch attempt. */
  async scheduled(controller, env) {
    const result = await dispatchCollect(env);
    console.log(
      `scheduler: tick ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()} -> ${result.reason}`,
    );
  },
};

function json(value, status, headers = {}) {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
