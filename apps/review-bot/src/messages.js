// Everything the reviewer reads. Turkish first, English mirrored, as everywhere in this project.
//
// The red-line reminder is on every candidate message, the way `render_issue` puts it at the top
// of every GitHub queue issue: these are unverified candidates, a human decides, and positions
// and movements of Turkish forces are never published.

import { screenSourceText } from './redline.js';
import { escapeHtml, link } from './telegram.js';

export const CALLBACK_VERSION = 'v1';
export const ACTIONS = Object.freeze(['onayla', 'reddet', 'sonra']);
const EXCERPT_LIMIT = 280;

/** The reminder that travels with every candidate. */
export const REDLINE_BANNER = [
  '⚠️ <b>Doğrulanmamış aday, yayımlanmış iddia değil.</b> Kararı insan verir (ADR 0007).',
  'Türk kuvvetlerinin konumu ve hareketleri hiçbir koşulda yayımlanmaz.',
  '⚠️ <b>Unverified candidate, not a published claim.</b> A human decides (ADR 0007).',
  'Positions and movements of Turkish forces are never published.',
].join('\n');

const WITHHELD = [
  '🚫 <i>Metin gösterilmiyor: Türk kuvvetlerinden söz ediyor ya da konum içeriyor.',
  'Kaynağı kendiniz açın; bot bu metni aktarmaz.</i>',
  '🚫 <i>Text withheld: it names Turkish forces or carries a position.',
  'Open the source yourself; the bot does not relay this wording.</i>',
].join('\n');

function truncate(value, limit) {
  const text = String(value ?? '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function score(signal) {
  const value = signal?.triage_score;
  return typeof value === 'number' ? value.toFixed(2) : '—';
}

function when(signal) {
  const value = signal?.published_at ?? signal?.fetched_at;
  return typeof value === 'string' ? value.replace('T', ' ').replace('Z', ' UTC') : '';
}

/**
 * Decide what of a candidate's source text may be shown.
 *
 * @returns {{withheld: boolean, positional: boolean, title: string|null, excerpt: string|null}}
 */
export function screenCandidate(signal) {
  const title = signal?.title ?? '';
  const excerpt = signal?.text ?? '';
  const verdict = screenSourceText(`${title} ${excerpt}`);
  if (!verdict.safe) {
    return { withheld: true, positional: verdict.positional, title: null, excerpt: null };
  }
  return {
    withheld: false,
    positional: verdict.positional,
    title: truncate(title, 200) || null,
    excerpt: truncate(excerpt, EXCERPT_LIMIT) || null,
  };
}

/** The inline keyboard under a candidate. */
export function keyboardFor(reviewId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Onayla', callback_data: `${CALLBACK_VERSION}|onayla|${reviewId}` },
        { text: '🚫 Reddet', callback_data: `${CALLBACK_VERSION}|reddet|${reviewId}` },
        { text: '⏭ Sonra', callback_data: `${CALLBACK_VERSION}|sonra|${reviewId}` },
      ],
    ],
  };
}

/** `v1|onayla|42` → `{action, reviewId}`, or null when the payload is anything else. */
export function parseCallbackData(data) {
  if (typeof data !== 'string') return null;
  const parts = data.split('|');
  if (parts.length !== 3) return null;
  const [version, action, rawId] = parts;
  if (version !== CALLBACK_VERSION) return null;
  if (!ACTIONS.includes(action)) return null;
  if (!/^\d{1,15}$/u.test(rawId)) return null;
  return { action, reviewId: Number(rawId) };
}

/** One candidate, with its source link and its relevance score. */
export function renderCandidate(review, signal) {
  const screened = screenCandidate(signal);
  const lines = [REDLINE_BANNER, ''];
  lines.push(`<b>#${review.id}</b> · ilgi / relevance <code>${score(signal)}</code>`);
  if (screened.withheld) {
    lines.push(WITHHELD);
  } else {
    lines.push(`<b>${escapeHtml(screened.title ?? '(başlıksız / untitled)')}</b>`);
    if (screened.excerpt) lines.push(escapeHtml(screened.excerpt));
  }
  if (screened.positional && !screened.withheld) {
    lines.push('⚠️ <i>konum/hareket dili — yayımlanamaz / positional language — not publishable</i>');
  }
  const facts = [];
  if (signal?.url) facts.push(link('kaynak / source', signal.url));
  if (signal?.region) facts.push(`bölge / region <code>${escapeHtml(signal.region)}</code>`);
  const moment = when(signal);
  if (moment) facts.push(escapeHtml(moment));
  if (facts.length > 0) lines.push(facts.join(' · '));
  if (!signal) {
    lines.push(
      '<i>Bu adayın sinyali gt-signals içinde bulunamadı (saklama süresi dolmuş olabilir). / ' +
        'No signal found in gt-signals for this candidate (it may have aged out).</i>',
    );
  }
  lines.push('');
  lines.push(
    '<i>Onayla = taslağa aday işareti, yayın değil. / Onayla marks it approved for a draft; it publishes nothing.</i>',
  );
  return lines.join('\n');
}

/** The compact list: one line per waiting candidate. */
export function renderQueue(reviews, signalsByHash, { total }) {
  if (reviews.length === 0) {
    return `${REDLINE_BANNER}\n\nKuyruk boş. / The queue is empty.`;
  }
  const lines = [REDLINE_BANNER, '', `<b>Bekleyen / waiting: ${total}</b>`, ''];
  for (const review of reviews) {
    const signal = signalsByHash.get(review.content_hash) ?? null;
    const screened = screenCandidate(signal);
    const label = screened.withheld
      ? '🚫 <i>metin gizlendi / text withheld</i>'
      : escapeHtml(truncate(screened.title ?? '(başlıksız / untitled)', 90));
    const parts = [`<b>#${review.id}</b>`, `<code>${score(signal)}</code>`, label];
    if (signal?.url) parts.push(link('kaynak / source', signal.url));
    lines.push(parts.join(' · '));
  }
  lines.push('');
  lines.push('Tek tek incelemek için / to review them one by one: /sonraki');
  lines.push('Belirli bir öğe / a specific item: /goster &lt;id&gt;');
  return lines.join('\n');
}

/** `/durum`. */
export function renderStatus(counts) {
  const rows = [
    ['Bekleyen / queued', counts.queued ?? 0],
    ['Taslağa onaylı / approved for draft', counts.drafted ?? 0],
    ['Reddedilen / dismissed', counts.dismissed ?? 0],
    ['Bülten / bulletined', counts.bulletined ?? 0],
    ['Kırmızı çizgi / red line', counts.redline ?? 0],
  ];
  return [
    '<b>İnceleme kuyruğu / review queue</b>',
    ...rows.map(([label, value]) => `${label}: <b>${value}</b>`),
    '',
    '<i>Bu bot hiçbir şey yayımlamaz; yalnızca kararınızı kaydeder. / ' +
      'This bot publishes nothing; it only records your decision.</i>',
  ].join('\n');
}

/** `/yardim`. */
export function renderHelp() {
  return [
    '<b>İnceleme botu / review bot</b>',
    '',
    '/kuyruk — bekleyen adayları listeler / list the waiting candidates',
    '/sonraki — sıradaki adayı düğmelerle gösterir / show the next candidate with its buttons',
    '/goster &lt;id&gt; — belirli bir adayı gösterir / show one candidate',
    '/durum — kuyruk sayıları / queue counts',
    '/yardim — bu metin / this text',
    '',
    '<b>Düğmeler / buttons</b>',
    '✅ <b>Onayla</b> — taslağa uygun işaretler (<code>drafted</code>). Hiçbir şey yayımlanmaz, PR açılmaz.',
    '🚫 <b>Reddet</b> — öğeyi kapatır (<code>dismissed</code>).',
    '⏭ <b>Sonra</b> — karar vermeden atlar; öğe kuyrukta kalır.',
    '',
    '✅ <b>Onayla</b> marks the item approved for a draft record (<code>drafted</code>). Nothing is',
    'published and no pull request is opened: the draft record is still made in GitHub, in the',
    '<code>datasets</code> repository, by a human.',
    '',
    REDLINE_BANNER,
  ].join('\n');
}

export const NOT_A_REVIEWER = [
  'Bu Telegram hesabı <code>reviewers</code> tablosunda kayıtlı değil, bu yüzden karar yazılamaz.',
  'Bir bakımcının satırı eklemesi gerekir (yalnızca Telegram kimliği ve rol; ad veya iletişim bilgisi tutulmaz).',
  '',
  'This Telegram account has no row in <code>reviewers</code>, so no decision can be written.',
  'A maintainer has to add one (Telegram id and role only; no names, no contact details).',
].join('\n');

export const ALREADY_DECIDED =
  'Bu öğe zaten karara bağlanmış. / This item has already been decided.';

export const UNKNOWN_COMMAND =
  'Bilinmeyen komut. /yardim yazın. / Unknown command — send /yardim.';
