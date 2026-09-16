// Configuration read from the Worker environment.
//
// The bot has no degraded mode: if a secret or a binding is missing, `readConfig` throws and
// `index.js` refuses every request with 503. Nothing here is ever logged as a value — error
// messages carry the *names* of what is missing and never the contents.

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Secrets, by name. `wrangler secret put <name>` for each; none of them lives in the repository. */
export const REQUIRED_SECRETS = Object.freeze([
  'TELEGRAM_BOT_TOKEN', // BotFather token, used only to call api.telegram.org
  'TELEGRAM_WEBHOOK_SECRET', // echoed by Telegram in X-Telegram-Bot-Api-Secret-Token
  'TELEGRAM_REVIEW_CHAT_ID', // the one private chat the bot answers in and posts to
  'TELEGRAM_ALLOWED_USER_IDS', // comma/space separated numeric Telegram user ids
]);

/** D1 bindings, by name. Database ids are not secrets (db/README.md). */
export const REQUIRED_BINDINGS = Object.freeze(['OPS_DB', 'SIGNALS_DB']);

const CHAT_ID = /^-?\d{1,19}$/;
const USER_ID = /^\d{1,19}$/;
const BOT_TOKEN = /^\d{3,20}:[A-Za-z0-9_-]{20,}$/;

function isD1(binding) {
  return Boolean(binding) && typeof binding.prepare === 'function';
}

function parseAllowedUserIds(raw) {
  const ids = raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (ids.length === 0) throw new ConfigError('TELEGRAM_ALLOWED_USER_IDS is empty');
  for (const id of ids) {
    if (!USER_ID.test(id)) {
      // The bad value itself is never reported: it is a real user id.
      throw new ConfigError('TELEGRAM_ALLOWED_USER_IDS must be numeric Telegram user ids');
    }
  }
  return new Set(ids.map(Number));
}

/**
 * Validate the environment and return the frozen runtime config.
 *
 * @throws {ConfigError} when anything required is missing or malformed.
 */
export function readConfig(env) {
  const missing = [];
  for (const name of REQUIRED_SECRETS) {
    const value = env?.[name];
    if (typeof value !== 'string' || value.trim() === '') missing.push(name);
  }
  for (const name of REQUIRED_BINDINGS) {
    if (!isD1(env?.[name])) missing.push(name);
  }
  if (missing.length > 0) {
    throw new ConfigError(`missing configuration: ${missing.join(', ')}`);
  }

  const botToken = env.TELEGRAM_BOT_TOKEN.trim();
  if (!BOT_TOKEN.test(botToken)) {
    throw new ConfigError('TELEGRAM_BOT_TOKEN does not look like a BotFather token');
  }
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET.trim();
  if (webhookSecret.length < 16) {
    throw new ConfigError('TELEGRAM_WEBHOOK_SECRET must be at least 16 characters');
  }
  const chatId = env.TELEGRAM_REVIEW_CHAT_ID.trim();
  if (!CHAT_ID.test(chatId)) {
    throw new ConfigError('TELEGRAM_REVIEW_CHAT_ID must be a numeric Telegram chat id');
  }

  return Object.freeze({
    botToken,
    webhookSecret,
    reviewChatId: Number(chatId),
    allowedUserIds: parseAllowedUserIds(env.TELEGRAM_ALLOWED_USER_IDS),
    ops: env.OPS_DB,
    signals: env.SIGNALS_DB,
    pageSize: 5,
  });
}
