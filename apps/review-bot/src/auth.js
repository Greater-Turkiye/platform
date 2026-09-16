// Authentication. Two independent gates, both mandatory:
//
//   1. Telegram's `X-Telegram-Bot-Api-Secret-Token` header must equal TELEGRAM_WEBHOOK_SECRET.
//   2. The update must come from TELEGRAM_REVIEW_CHAT_ID and from a user id in
//      TELEGRAM_ALLOWED_USER_IDS.
//
// Anything else is a 401. Rejections are logged as a reason and an update id only: never the
// message text, never a user id, never a name.

/**
 * Constant-time string comparison.
 *
 * Both sides are hashed first, so the loop always runs over 32 bytes and the comparison leaks
 * neither the length nor the content of the expected secret.
 */
export async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(a ?? ''))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(b ?? ''))),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** True when the request carries the right Telegram secret token header. */
export async function verifySecretHeader(request, config) {
  const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (typeof provided !== 'string' || provided === '') return false;
  return timingSafeEqual(provided, config.webhookSecret);
}

/**
 * Pull the acting user and chat out of an update.
 *
 * Only `message` and `callback_query` updates are understood; `setWebhook` asks Telegram for
 * exactly those two. Anything else returns null and is ignored without touching the database.
 */
export function actorOf(update) {
  if (!update || typeof update !== 'object') return null;
  const message = update.message;
  const callback = update.callback_query;
  if (message && typeof message === 'object') {
    const from = message.from;
    const chat = message.chat;
    if (!from || !chat) return null;
    return { kind: 'message', userId: from.id, isBot: from.is_bot === true, chatId: chat.id };
  }
  if (callback && typeof callback === 'object') {
    const from = callback.from;
    const chat = callback.message?.chat;
    if (!from || !chat) return null;
    return { kind: 'callback', userId: from.id, isBot: from.is_bot === true, chatId: chat.id };
  }
  return null;
}

/** True when the update comes from the review chat and from an allow-listed human. */
export function isAllowedActor(actor, config) {
  if (!actor) return false;
  if (actor.isBot) return false;
  if (!Number.isInteger(actor.chatId) || actor.chatId !== config.reviewChatId) return false;
  if (!Number.isInteger(actor.userId) || !config.allowedUserIds.has(actor.userId)) return false;
  return true;
}
