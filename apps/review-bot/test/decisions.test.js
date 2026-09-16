// The decision write: who decided, when, and what "onayla" does and does not do.

import { describe, expect, it } from 'vitest';

import { handleRequest } from '../src/index.js';
import {
  FAKE_NOW,
  STRANGER_USER_ID,
  buttonUpdate,
  createFakeTelegramFetch,
  makeEnv,
  makeReview,
  makeSignal,
  webhookRequest,
} from './helpers.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function env() {
  return makeEnv({
    reviews: [
      makeReview({ id: 1, content_hash: HASH_A, created_at: '2026-09-15T08:00:00Z' }),
      makeReview({ id: 2, content_hash: HASH_B, created_at: '2026-09-15T09:00:00Z' }),
    ],
    reviewers: [{ id: 7, telegram_user_id: 900000001, role: 'maintainer', active: 1 }],
    signals: [makeSignal({ content_hash: HASH_A }), makeSignal({ content_hash: HASH_B })],
  });
}

async function tap(target, data, options) {
  const tg = createFakeTelegramFetch();
  const response = await handleRequest(webhookRequest(buttonUpdate(data, options)), target, {
    fetchImpl: tg,
  });
  expect(response.status).toBe(200);
  return tg;
}

describe('onayla', () => {
  it('writes an approval with the reviewer and a timestamp', async () => {
    const target = env();
    const tg = await tap(target, 'v1|onayla|1');

    const [review] = target.OPS_DB.data.reviews;
    expect(review.status).toBe('drafted');
    expect(review.decided_by).toBe(7);
    expect(review.decided_at).toBe(FAKE_NOW);
    expect(tg.toasts()[0]).toContain('Approved for a draft');
    expect(tg.toasts()[0]).toContain('Nothing was published');
  });

  it('publishes nothing and opens no pull request', async () => {
    const target = env();
    const tg = await tap(target, 'v1|onayla|1');

    // The only outbound calls are to the review chat; there is no GitHub call and no other chat.
    for (const call of tg.calls) {
      expect(['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']).toContain(call.method);
      if (call.payload.chat_id !== undefined) expect(call.payload.chat_id).toBe(-1002000000001);
    }
    // `drafts` is untouched: the draft record is still opened in GitHub by a human.
    expect(target.OPS_DB.calls.every((call) => !call.sql.includes('drafts'))).toBe(true);
  });

  it('takes the buttons off the decided card', async () => {
    const tg = await tap(env(), 'v1|onayla|1');
    const edit = tg.calls.find((call) => call.method === 'editMessageReplyMarkup');
    expect(edit.payload.message_id).toBe(42);
    expect(edit.payload.reply_markup).toEqual({ inline_keyboard: [] });
  });
});

describe('reddet', () => {
  it('dismisses the item with the reviewer and a timestamp', async () => {
    const target = env();
    const tg = await tap(target, 'v1|reddet|2');

    const review = target.OPS_DB.data.reviews[1];
    expect(review.status).toBe('dismissed');
    expect(review.decided_by).toBe(7);
    expect(review.decided_at).toBe(FAKE_NOW);
    expect(tg.toasts()[0]).toContain('dismissed');
  });
});

describe('sonra', () => {
  it('leaves the item queued, records the skip and shows the next one', async () => {
    const target = env();
    const tg = await tap(target, 'v1|sonra|1');

    const [skipped] = target.OPS_DB.data.reviews;
    expect(skipped.status).toBe('queued');
    expect(skipped.decided_by).toBeNull();
    expect(skipped.note).toBe(`sonra / skipped by reviewer 7 at ${FAKE_NOW}`);
    expect(tg.texts()[0]).toContain('#2');
  });

  it('says the queue is empty when there is nothing after it', async () => {
    const target = env();
    const tg = await tap(target, 'v1|sonra|2');
    expect(tg.texts()[0]).toContain('Nothing is waiting in the queue.');
  });
});

describe('a decision that cannot be written', () => {
  it('refuses a second tap on an item that is already decided', async () => {
    const target = env();
    await tap(target, 'v1|onayla|1');
    const tg = await tap(target, 'v1|reddet|1');

    expect(target.OPS_DB.data.reviews[0].status).toBe('drafted');
    expect(tg.toasts()[0]).toContain('already been decided');
  });

  it('writes nothing for an allow-listed user with no reviewer row', async () => {
    const target = env();
    const tg = await tap(target, 'v1|onayla|1', { userId: STRANGER_USER_ID });

    expect(target.OPS_DB.data.reviews[0].status).toBe('queued');
    expect(tg.texts()[0]).toContain('no row in <code>reviewers</code>');
    expect(tg.texts()[0]).toContain('no names, no contact details');
  });

  it('ignores callback data it did not produce', async () => {
    const target = env();
    const tg = await tap(target, 'publish|now|1');

    expect(target.OPS_DB.calls).toHaveLength(0);
    expect(tg.toasts()[0]).toContain('Not understood');
  });

  it('ignores an unknown review id', async () => {
    const target = env();
    const tg = await tap(target, 'v1|onayla|9999');
    expect(tg.toasts()[0]).toContain('No such item.');
  });
});

describe('what is stored about a reviewer', () => {
  it('never writes a name, a username or a Telegram id into a decision', async () => {
    const target = env();
    await tap(target, 'v1|onayla|1');

    const writes = target.OPS_DB.calls.filter((call) => call.sql.startsWith('UPDATE'));
    for (const write of writes) {
      for (const param of write.params) {
        expect(String(param)).not.toContain('900000001');
      }
    }
    expect(target.OPS_DB.data.reviews[0].decided_by).toBe(7);
  });
});
