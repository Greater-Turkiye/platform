// The red line. CLAUDE.md §2, handbook 02-red-lines, ADR 0013, ADR 0015.

import { describe, expect, it } from 'vitest';

import { handleRequest } from '../src/index.js';
import { renderCandidate, screenCandidate } from '../src/messages.js';
import { guardOutgoing, mentionsTurkishForces, screenSourceText } from '../src/redline.js';
import {
  commandUpdate,
  createFakeTelegramFetch,
  makeEnv,
  makeReview,
  makeSignal,
  webhookRequest,
} from './helpers.js';

const HASH = `sha256:${'a'.repeat(64)}`;

describe('recognising Turkish forces', () => {
  const hits = [
    'Türk Silahlı Kuvvetleri bölgede',
    "TSK'nın açıklaması",
    'Turkish forces in the area',
    'turkish troops',
    'Turk Silahli Kuvvetleri', // written without Turkish letters
    "Türk Silahlı Kuvvetleri'nin unsurları", // Turkish suffix on the last word
    'Mehmetçik',
  ];
  for (const text of hits) {
    it(`matches ${text}`, () => expect(mentionsTurkishForces(text)).toBe(true));
  }

  const misses = ['Yunan ordusu tatbikat yaptı', 'a Turkish exporter', 'liman anlaşması'];
  for (const text of misses) {
    it(`does not match ${text}`, () => expect(mentionsTurkishForces(text)).toBe(false));
  }
});

describe('screening source text', () => {
  it('withholds anything that names Turkish forces', () => {
    const verdict = screenSourceText('Türk Silahlı Kuvvetleri unsurları bölgeye intikal etti');
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toBe('turkish-forces');
  });

  it('withholds coordinates whoever they belong to', () => {
    expect(screenSourceText('gemi 36.8021 N 28.2534 E açıklarında').safe).toBe(false);
    expect(screenSourceText('grid 37S DH 1234 5678').safe).toBe(false);
  });

  it('relays other positional language but flags it', () => {
    const verdict = screenSourceText('Yunan birlikleri adaya konuşlandırıldı');
    expect(verdict.safe).toBe(true);
    expect(verdict.positional).toBe(true);
  });

  it('leaves ordinary candidates alone', () => {
    const verdict = screenSourceText('Limanda yeni terminal anlaşması imzalandı');
    expect(verdict).toEqual({ safe: true, reason: null, positional: false });
  });
});

describe('a candidate that touches the red line', () => {
  const signal = makeSignal({
    title: "TSK unsurları sınır hattına intikal etti",
    text: 'Kaynaklara göre birlikler yeni mevzilere yerleşti.',
  });

  it('is never relayed word for word', () => {
    const screened = screenCandidate(signal);
    expect(screened.withheld).toBe(true);
    expect(screened.title).toBeNull();
    expect(screened.excerpt).toBeNull();
  });

  it('is still shown as a link, with the reminder', () => {
    const text = renderCandidate(makeReview(), signal);
    expect(text).not.toContain('TSK');
    expect(text).not.toContain('mevzi');
    expect(text).toContain('Metin gösterilmiyor');
    expect(text).toContain(signal.url);
    expect(text).toContain('Positions and movements of Turkish forces are never published.');
  });

  it('reaches Telegram with the wording withheld', async () => {
    const env = makeEnv({
      reviews: [makeReview({ id: 1, content_hash: HASH })],
      signals: [makeSignal({ content_hash: HASH, ...signal })],
    });
    const tg = createFakeTelegramFetch();

    await handleRequest(webhookRequest(commandUpdate('/sonraki')), env, { fetchImpl: tg });

    const [text] = tg.texts();
    expect(text).not.toContain('TSK');
    expect(text).not.toContain('intikal');
    expect(text).toContain('🚫');
    expect(text).toContain('https://example.org/haber/1');
  });
});

describe('the reminder', () => {
  it('rides along with every candidate message', () => {
    const text = renderCandidate(makeReview(), makeSignal());
    expect(text).toContain('Doğrulanmamış aday, yayımlanmış iddia değil.');
    expect(text).toContain('Türk kuvvetlerinin konumu ve hareketleri hiçbir koşulda yayımlanmaz.');
    expect(text).toContain('Unverified candidate, not a published claim.');
    expect(text).toContain('ADR 0007');
  });
});

describe('the backstop over outgoing messages', () => {
  it('lets the bot’s own templates through', () => {
    expect(() => guardOutgoing(renderCandidate(makeReview(), makeSignal()))).not.toThrow();
  });

  it('refuses a message carrying a coordinate', () => {
    expect(() => guardOutgoing('hedef 36.8021 N')).toThrow(/coordinate/u);
  });

  it('sends a fixed notice instead of a message the guard refuses', async () => {
    const env = makeEnv({
      reviews: [makeReview({ id: 1, content_hash: HASH })],
      signals: [makeSignal({ content_hash: HASH, region: '36.8021 N 28.2534 E' })],
    });
    const tg = createFakeTelegramFetch();

    await handleRequest(webhookRequest(commandUpdate('/sonraki')), env, { fetchImpl: tg });

    const [text] = tg.texts();
    expect(text).toContain('red-line check');
    expect(text).not.toContain('36.8021');
  });
});
