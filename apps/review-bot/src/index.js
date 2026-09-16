// review-bot: the private Telegram triage tool for the collected candidates.
//
// One route, one chat, one job: show a maintainer what is waiting in `gt-ops.reviews` and write
// down the decision. It never decides anything itself and it never publishes (ADR 0007).
//
// Request handling, in order:
//   1. Configuration. A missing secret or binding means every request is refused with 503 —
//      there is no degraded mode.
//   2. `X-Telegram-Bot-Api-Secret-Token`, compared in constant time. Otherwise 401.
//   3. The chat id and the user id, against the allow-list in the environment. Otherwise 401.
//   4. Only then is anything read from or written to D1.
//
// Rejections are logged as a reason and the update id, never as content.

import { actorOf, isAllowedActor, verifySecretHeader } from './auth.js';
import { ConfigError, readConfig } from './config.js';
import { createTelegram } from './telegram.js';
import { handleUpdate } from './update.js';

export const WEBHOOK_PATH = '/telegram/webhook';
const MAX_BODY_BYTES = 64 * 1024;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function reject(reason, updateId = null) {
  console.warn('review-bot: rejected', JSON.stringify({ reason, update_id: updateId }));
  return json(401, { ok: false });
}

/**
 * @param {Request} request
 * @param {Record<string, unknown>} env
 * @param {{fetchImpl?: typeof fetch}} [deps] injection seam for the tests
 */
export async function handleRequest(request, env, deps = {}) {
  let config;
  try {
    config = readConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // The message lists the names of what is missing, never any value.
    console.error('review-bot: refusing every request —', error.message);
    return json(503, { ok: false, error: 'not configured' });
  }

  const url = new URL(request.url);
  if (url.pathname === '/health') {
    return json(200, { ok: true, service: 'review-bot' });
  }
  if (url.pathname !== WEBHOOK_PATH) {
    return json(404, { ok: false });
  }
  if (request.method !== 'POST') {
    return json(405, { ok: false });
  }
  if (!(await verifySecretHeader(request, config))) {
    return reject('bad-secret-token');
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    console.warn('review-bot: rejected', JSON.stringify({ reason: 'body-too-large' }));
    return json(413, { ok: false });
  }
  let update;
  try {
    update = JSON.parse(raw);
  } catch {
    console.warn('review-bot: rejected', JSON.stringify({ reason: 'invalid-json' }));
    return json(400, { ok: false });
  }
  const updateId = Number.isInteger(update?.update_id) ? update.update_id : null;

  const actor = actorOf(update);
  if (!actor) {
    // `setWebhook` asks for message and callback_query only; anything else is dropped untouched.
    console.log('review-bot: ignored update type', JSON.stringify({ update_id: updateId }));
    return json(200, { ok: true, ignored: true });
  }
  if (!isAllowedActor(actor, config)) {
    return reject('not-allow-listed', updateId);
  }

  const ctx = { config, tg: createTelegram(config, deps.fetchImpl) };
  try {
    const outcome = await handleUpdate(update, ctx);
    return json(200, { ok: true, handled: outcome?.handled === true });
  } catch (error) {
    // Telegram retries a 5xx, which is what we want for a transient D1 error. The message is
    // logged; the update itself is not.
    console.error('review-bot: update failed —', error?.message ?? 'unknown error');
    return json(500, { ok: false });
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
