// The only place that talks to api.telegram.org.
//
// `chat_id` is not a parameter of `sendMessage` here: it is always `config.reviewChatId`. The bot
// therefore cannot post to a channel, a group or a person, by accident or by a crafted update —
// there is no code path that would carry another chat id. Nothing this bot sends is public.
//
// Every outgoing body passes `guardOutgoing` (src/redline.js) first. If the guard refuses, a
// fixed, known-safe notice is sent instead and the refusal is logged without the text.

import { RedlineError, guardOutgoing } from './redline.js';

const API = 'https://api.telegram.org';

const REFUSED_NOTICE =
  '⚠️ Bu öğe gösterilemiyor: metin kırmızı çizgi denetimine takıldı. Kaynağı GitHub kuyruğundan açın.\n' +
  '⚠️ This item cannot be shown: its text did not pass the red-line check. Open it from the GitHub queue.';

/** Escape the five characters Telegram's HTML parse mode cares about. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** An `<a>` for a source link, or plain escaped text when the URL is not http(s). */
export function link(label, url) {
  const raw = String(url ?? '');
  if (!/^https?:\/\/\S+$/u.test(raw)) return escapeHtml(label);
  return `<a href="${escapeHtml(raw)}">${escapeHtml(label)}</a>`;
}

export function createTelegram(config, fetchImpl) {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function call(method, payload) {
    const response = await doFetch(`${API}/bot${config.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok || body?.ok !== true) {
      // Log the method and the status only: the payload carries reviewer-facing text.
      console.error('review-bot: telegram call failed', method, response.status);
      return null;
    }
    return body.result;
  }

  return {
    /** Send to the review chat. There is no other destination. */
    async sendMessage(text, { replyMarkup = null } = {}) {
      let body = text;
      try {
        guardOutgoing(body);
      } catch (error) {
        if (!(error instanceof RedlineError)) throw error;
        console.error('review-bot: refused to send a message', error.message);
        body = REFUSED_NOTICE;
      }
      return call('sendMessage', {
        chat_id: config.reviewChatId,
        text: body,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    },

    /** Acknowledge a button tap; Telegram shows the text as a toast in the same chat. */
    async answerCallbackQuery(callbackQueryId, text) {
      return call('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text.slice(0, 200),
        show_alert: false,
      });
    },

    /** Drop the buttons from a decided card, so it cannot be tapped twice. */
    async clearButtons(messageId) {
      if (!Number.isInteger(messageId)) return null;
      return call('editMessageReplyMarkup', {
        chat_id: config.reviewChatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      });
    },
  };
}
