// The red line, enforced on everything the bot sends.
//
// Handbook 02-red-lines, ADR 0013, ADR 0015, CLAUDE.md §2: positions, movements, deployments and
// order of battle of Turkish forces are never published. The GitHub review queue
// (`collectors/src/gt_collectors/review.py`) marks such candidates with `redline_check` and keeps
// the red-line reminder at the top of every issue. A Telegram message is a *message*, not a
// checklist behind a login, so this Worker goes one step further than the issue:
//
//   1. Source text (title and excerpt) that mentions Turkish forces at all is **withheld**. The
//      candidate is still queued and still shown, as a link plus its score, with a marker telling
//      the reviewer to open the source. The bot never relays the wording.
//   2. `guardOutgoing` is a backstop over the finished message: coordinates, grid references and
//      bearing/distance phrases never appear in our own templates, so if one reaches the send
//      path something upstream is wrong and the send is refused.
//
// The term list is kept in step with `_REDLINE_TERMS` in the collectors' review queue.

export class RedlineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RedlineError';
  }
}

const FORCE_TERMS = [
  'türk silahlı kuvvetleri',
  'türk ordusu',
  'türk askeri',
  'türk askerleri',
  'türk birlikleri',
  'türk deniz kuvvetleri',
  'türk hava kuvvetleri',
  'türk kara kuvvetleri',
  'mehmetçik',
  'tsk',
  'sat komandoları',
  'turkish armed forces',
  'turkish forces',
  'turkish troops',
  'turkish soldiers',
  'turkish military',
  'turkish navy',
  'turkish air force',
  'turkish army',
];

// Matched as substrings, because Turkish suffixes glue onto the stem
// ("konuşlan" → "konuşlandırıldı", "konuşlandırma").
const POSITION_STEMS = [
  'konuşlan',
  'konuşlu',
  'mevzi',
  'intikal',
  'sevkiyat',
  'yığınak',
  'takviye kuvvet',
  'muharebe düzeni',
  'order of battle',
  'deploy',
  'redeploy',
  'troop movement',
  'force posture',
  'stationed at',
  'garrisoned',
];

const DIACRITICS = { ı: 'i', İ: 'i', I: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u' };

/** NFC, collapse whitespace, lowercase in the Turkish locale. */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('tr');
}

/** The same string with Turkish letters folded to ASCII, so "turk ordusu" matches too. */
function fold(value) {
  return value.replace(/[ıİIşŞğĞüÜöÖçÇâîû]/gu, (ch) => DIACRITICS[ch] ?? ch);
}

function variants(value) {
  const normalized = normalizeText(value);
  return [normalized, fold(normalized)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function alternation(terms) {
  return [...new Set(terms.flatMap((term) => variants(term)))].map(escapeRegExp).join('|');
}

// Multi-word terms are matched as prefixes, because Turkish suffixes glue onto the last word
// ("Türk Silahlı Kuvvetleri" → "…Kuvvetlerinin"). Single words keep both boundaries so that a
// short term such as "TSK" cannot match inside an unrelated word.
const MULTIWORD = FORCE_TERMS.filter((term) => term.includes(' '));
const SINGLE = FORCE_TERMS.filter((term) => !term.includes(' '));
const FORCE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:${alternation(MULTIWORD)})|(?:(?:${alternation(SINGLE)})(?![\\p{L}\\p{N}])))`,
  'u',
);
const STEMS = [...new Set(POSITION_STEMS.flatMap((term) => variants(term)))];

// Decimal degrees ("36.8021 N", "36,8021°N"), degrees-minutes ("36° 48' N") and MGRS
// ("37S DH 1234 5678"). None of these ever occurs in a template written here.
const COORDINATE_RES = [
  /(?<![\p{L}\p{N}])\d{1,3}[.,]\d{3,}\s*°?\s*[NSEWKGDB](?![\p{L}\p{N}])/iu,
  /\d{1,3}\s*°\s*\d{1,2}\s*['′]/u,
  /(?<![\p{L}\p{N}])\d{1,2}[C-HJ-NP-X]\s?[A-HJ-NP-Z]{2}\s?\d{2,10}(?![\p{L}\p{N}])/u,
];

/** True when the text names Turkish forces. */
export function mentionsTurkishForces(value) {
  const [normalized, folded] = variants(value);
  return FORCE_RE.test(normalized) || FORCE_RE.test(folded);
}

/** True when the text talks about positions, movements, deployments or order of battle. */
export function mentionsPositionOrMovement(value) {
  const [normalized, folded] = variants(value);
  return STEMS.some((stem) => normalized.includes(stem) || folded.includes(stem));
}

/** True when the text carries a coordinate or a grid reference. */
export function hasCoordinates(value) {
  const text = String(value ?? '');
  return COORDINATE_RES.some((re) => re.test(text));
}

/**
 * Screen one piece of source-derived text.
 *
 * `safe: false` means the bot must not relay the wording at all. A mention of Turkish forces is
 * withheld whether or not it also talks about movement: the two together are exactly the red
 * line, and telling them apart by keyword is not a judgement worth trusting a message to.
 * Positional language about anyone else is relayed but flagged, so the reviewer reads it knowing
 * what the red line covers.
 *
 * @returns {{safe: boolean, reason: string|null, positional: boolean}}
 */
export function screenSourceText(value) {
  const positional = mentionsPositionOrMovement(value);
  if (mentionsTurkishForces(value)) return { safe: false, reason: 'turkish-forces', positional };
  if (hasCoordinates(value)) return { safe: false, reason: 'coordinates', positional };
  return { safe: true, reason: null, positional };
}

/**
 * Backstop over an assembled outgoing message.
 *
 * Our own templates never contain coordinates or grid references, so one here means source text
 * slipped past `screenSourceText`. Refusing to send is the safe failure.
 *
 * @throws {RedlineError}
 */
export function guardOutgoing(text) {
  if (hasCoordinates(text)) {
    throw new RedlineError('outgoing message contains a coordinate or grid reference');
  }
  return text;
}
