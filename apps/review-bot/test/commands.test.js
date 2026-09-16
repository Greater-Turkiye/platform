// Every command's happy path, against the fake D1.

import { describe, expect, it } from 'vitest';

import { handleRequest } from '../src/index.js';
import {
  commandUpdate,
  createFakeTelegramFetch,
  makeEnv,
  makeReview,
  makeSignal,
  webhookRequest,
} from './helpers.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function queueEnv() {
  return makeEnv({
    reviews: [
      makeReview({ id: 1, content_hash: HASH_A, created_at: '2026-09-15T08:00:00Z' }),
      makeReview({ id: 2, content_hash: HASH_B, created_at: '2026-09-15T09:00:00Z' }),
      makeReview({
        id: 3,
        status: 'drafted',
        content_hash: `sha256:${'c'.repeat(64)}`,
        decided_by: 1,
        decided_at: '2026-09-15T10:00:00Z',
        created_at: '2026-09-15T07:00:00Z',
      }),
    ],
    reviewers: [{ id: 1, telegram_user_id: 900000001, role: 'maintainer', active: 1 }],
    signals: [
      makeSignal({ content_hash: HASH_A, title: 'Ortak tatbikat duyuruldu', triage_score: 0.72 }),
      makeSignal({
        content_hash: HASH_B,
        title: 'Limanda yeni terminal anlaşması',
        url: 'https://example.org/haber/2',
        triage_score: 0.55,
      }),
    ],
  });
}

async function send(env, text) {
  const tg = createFakeTelegramFetch();
  const response = await handleRequest(webhookRequest(commandUpdate(text)), env, { fetchImpl: tg });
  expect(response.status).toBe(200);
  return tg;
}

describe('/kuyruk', () => {
  it('lists the queued candidates, oldest first, with their scores and links', async () => {
    const env = queueEnv();
    const tg = await send(env, '/kuyruk');

    const [text] = tg.texts();
    expect(tg.sent()).toHaveLength(1);
    expect(text).toContain('Bekleyen / waiting: 2');
    expect(text).toContain('Ortak tatbikat duyuruldu');
    expect(text).toContain('Limanda yeni terminal anlaşması');
    expect(text).toContain('https://example.org/haber/1');
    expect(text).toContain('0.72');
    expect(text.indexOf('#1')).toBeLessThan(text.indexOf('#2'));
    // The decided item is not in the queue.
    expect(text).not.toContain('#3');
    // The red-line reminder travels with the list, as it does in the GitHub queue.
    expect(text).toContain('Positions and movements of Turkish forces are never published.');
  });

  it('answers the English alias too', async () => {
    const tg = await send(queueEnv(), '/queue@gt_review_bot');
    expect(tg.sent()).toHaveLength(1);
  });

  it('says so when the queue is empty', async () => {
    const tg = await send(makeEnv(), '/kuyruk');
    expect(tg.texts()[0]).toContain('Kuyruk boş.');
  });
});

describe('/sonraki', () => {
  it('shows the oldest candidate with its source link, score and buttons', async () => {
    const env = queueEnv();
    const tg = await send(env, '/sonraki');

    const [call] = tg.sent();
    expect(call.payload.text).toContain('#1');
    expect(call.payload.text).toContain('Ortak tatbikat duyuruldu');
    expect(call.payload.text).toContain('https://example.org/haber/1');
    expect(call.payload.text).toContain('ilgi / relevance');
    expect(call.payload.text).toContain('0.72');
    expect(call.payload.link_preview_options).toEqual({ is_disabled: true });

    const buttons = call.payload.reply_markup.inline_keyboard[0];
    expect(buttons.map((button) => button.callback_data)).toEqual([
      'v1|onayla|1',
      'v1|reddet|1',
      'v1|sonra|1',
    ]);
    expect(buttons.map((button) => button.text)).toEqual(['✅ Onayla', '🚫 Reddet', '⏭ Sonra']);
  });

  it('remembers which message shows the candidate', async () => {
    const env = queueEnv();
    await send(env, '/sonraki');
    expect(env.OPS_DB.data.reviews[0].telegram_message_id).toBe(5001);
  });

  it('says so when nothing is waiting', async () => {
    const tg = await send(makeEnv(), '/sonraki');
    expect(tg.texts()[0]).toContain('Nothing is waiting in the queue.');
  });

  it('only ever posts to the review chat', async () => {
    const env = queueEnv();
    const tg = await send(env, '/sonraki');
    for (const call of tg.calls) {
      expect(call.payload.chat_id).toBe(-1002000000001);
    }
  });
});

describe('/goster', () => {
  it('shows one candidate by id', async () => {
    const tg = await send(queueEnv(), '/goster 2');
    expect(tg.texts()[0]).toContain('Limanda yeni terminal anlaşması');
    expect(tg.sent()[0].payload.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      'v1|onayla|2',
    );
  });

  it('shows a decided item without buttons', async () => {
    const tg = await send(queueEnv(), '/goster 3');
    expect(tg.sent()[0].payload.reply_markup).toBeUndefined();
  });

  it('asks for an id when none is given', async () => {
    const tg = await send(queueEnv(), '/goster');
    expect(tg.texts()[0]).toContain('/goster');
  });

  it('reports an id that does not exist', async () => {
    const tg = await send(queueEnv(), '/goster 999');
    expect(tg.texts()[0]).toContain('No such item.');
  });
});

describe('/durum', () => {
  it('reports the counts per status', async () => {
    const tg = await send(queueEnv(), '/durum');
    const [text] = tg.texts();
    expect(text).toContain('Bekleyen / queued: <b>2</b>');
    expect(text).toContain('Taslağa onaylı / approved for draft: <b>1</b>');
    expect(text).toContain('This bot publishes nothing');
  });
});

describe('/yardim', () => {
  it('explains the commands and that approval publishes nothing', async () => {
    const tg = await send(queueEnv(), '/yardim');
    const [text] = tg.texts();
    expect(text).toContain('/kuyruk');
    expect(text).toContain('/sonraki');
    expect(text).toContain('/goster');
    expect(text).toContain('Nothing is');
    expect(text).toContain('no pull request is opened');
  });

  it('answers /start the same way', async () => {
    const tg = await send(queueEnv(), '/start');
    expect(tg.texts()[0]).toContain('/kuyruk');
  });
});

describe('anything else', () => {
  it('points at the help for an unknown command', async () => {
    const tg = await send(queueEnv(), '/publish');
    expect(tg.texts()[0]).toContain('Unknown command');
  });

  it('stays silent on ordinary chat', async () => {
    const env = queueEnv();
    const tg = createFakeTelegramFetch();
    await handleRequest(webhookRequest(commandUpdate('günaydın')), env, { fetchImpl: tg });
    expect(tg.calls).toHaveLength(0);
  });
});
