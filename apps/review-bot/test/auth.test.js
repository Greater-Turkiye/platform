// Authentication and the refusal to run without secrets.

import { describe, expect, it } from 'vitest';

import { handleRequest } from '../src/index.js';
import {
  CHAT_ID,
  STRANGER_USER_ID,
  buttonUpdate,
  commandUpdate,
  createFakeTelegramFetch,
  makeEnv,
  makeReview,
  webhookRequest,
} from './helpers.js';

describe('the webhook secret token', () => {
  it('rejects an update with no secret header and touches nothing', async () => {
    const env = makeEnv({ reviews: [makeReview()] });
    const tg = createFakeTelegramFetch();

    const response = await handleRequest(webhookRequest(commandUpdate('/kuyruk'), { secret: null }), env, {
      fetchImpl: tg,
    });

    expect(response.status).toBe(401);
    expect(tg.calls).toHaveLength(0);
    expect(env.OPS_DB.calls).toHaveLength(0);
    expect(env.SIGNALS_DB.calls).toHaveLength(0);
  });

  it('rejects a wrong secret header', async () => {
    const env = makeEnv();
    const tg = createFakeTelegramFetch();

    const response = await handleRequest(
      webhookRequest(commandUpdate('/kuyruk'), { secret: 'not-the-webhook-secret-at-all' }),
      env,
      { fetchImpl: tg },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
    expect(tg.calls).toHaveLength(0);
  });

  it('rejects a GET on the webhook route', async () => {
    const env = makeEnv();
    const response = await handleRequest(webhookRequest(null, { method: 'GET' }), env);
    expect(response.status).toBe(405);
  });
});

describe('the allow-list', () => {
  it('rejects an update from an unknown chat id', async () => {
    const env = makeEnv({ reviews: [makeReview()] });
    const tg = createFakeTelegramFetch();

    const response = await handleRequest(
      webhookRequest(commandUpdate('/kuyruk', { chatId: CHAT_ID + 7 })),
      env,
      { fetchImpl: tg },
    );

    expect(response.status).toBe(401);
    expect(tg.calls).toHaveLength(0);
    expect(env.OPS_DB.calls).toHaveLength(0);
  });

  it('rejects a button tap from an unknown chat id', async () => {
    const env = makeEnv({ reviews: [makeReview()] });
    const tg = createFakeTelegramFetch();

    const response = await handleRequest(
      webhookRequest(buttonUpdate('v1|onayla|1', { chatId: CHAT_ID + 7 })),
      env,
      { fetchImpl: tg },
    );

    expect(response.status).toBe(401);
    expect(env.OPS_DB.data.reviews[0].status).toBe('queued');
  });

  it('rejects a user who is not on the allow-list', async () => {
    const env = makeEnv();
    const tg = createFakeTelegramFetch();

    const response = await handleRequest(
      webhookRequest(commandUpdate('/kuyruk', { userId: 123456789 })),
      env,
      { fetchImpl: tg },
    );

    expect(response.status).toBe(401);
    expect(tg.calls).toHaveLength(0);
  });

  it('rejects another bot', async () => {
    const env = makeEnv();
    const update = commandUpdate('/kuyruk', { userId: STRANGER_USER_ID });
    update.message.from.is_bot = true;

    const response = await handleRequest(webhookRequest(update), env);

    expect(response.status).toBe(401);
  });

  it('ignores an update type it does not handle', async () => {
    const env = makeEnv();
    const response = await handleRequest(
      webhookRequest({ update_id: 5, edited_channel_post: { text: 'x' } }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
    expect(env.OPS_DB.calls).toHaveLength(0);
  });
});

describe('without its secrets', () => {
  const names = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'TELEGRAM_REVIEW_CHAT_ID',
    'TELEGRAM_ALLOWED_USER_IDS',
    'OPS_DB',
    'SIGNALS_DB',
  ];

  for (const name of names) {
    it(`refuses every request when ${name} is missing`, async () => {
      const env = makeEnv({ [name]: undefined });
      const tg = createFakeTelegramFetch();

      const webhook = await handleRequest(webhookRequest(commandUpdate('/kuyruk')), env, {
        fetchImpl: tg,
      });
      const health = await handleRequest(
        new Request('https://review-bot.example.workers.dev/health'),
        env,
      );

      expect(webhook.status).toBe(503);
      expect(health.status).toBe(503);
      expect(tg.calls).toHaveLength(0);
    });
  }

  it('refuses when the allow-list is not a list of numeric ids', async () => {
    const env = makeEnv({ TELEGRAM_ALLOWED_USER_IDS: '@someone' });
    const response = await handleRequest(webhookRequest(commandUpdate('/kuyruk')), env);
    expect(response.status).toBe(503);
  });
});

describe('routing', () => {
  it('answers /health when everything is configured', async () => {
    const env = makeEnv();
    const response = await handleRequest(
      new Request('https://review-bot.example.workers.dev/health'),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'review-bot' });
  });

  it('has no other route', async () => {
    const env = makeEnv();
    const response = await handleRequest(
      new Request('https://review-bot.example.workers.dev/', { method: 'POST' }),
      env,
    );
    expect(response.status).toBe(404);
  });
});
