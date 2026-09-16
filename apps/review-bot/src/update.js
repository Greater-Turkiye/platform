// Commands and buttons. Everything here runs only after `auth.js` has accepted the update.
//
// Nothing in this file publishes. "Onayla" sets `reviews.status = 'drafted'` — approved for a
// draft record — and stops there; the draft record itself is still made in GitHub, in the
// `datasets` repository, by the `kayda-gec` path (see apps/review-bot/README.md). The seam for a
// later step that opens that pull request automatically is `onApproved` below.

import {
  ALREADY_DECIDED,
  NOT_A_REVIEWER,
  UNKNOWN_COMMAND,
  keyboardFor,
  parseCallbackData,
  renderCandidate,
  renderHelp,
  renderQueue,
  renderStatus,
} from './messages.js';
import {
  activeReviewer,
  countQueued,
  nextReviews,
  recordDecision,
  recordSkip,
  rememberMessageId,
  reviewById,
  signalsByHash,
  statusCounts,
} from './queue.js';

const EMPTY_QUEUE = 'Kuyrukta bekleyen aday yok. / Nothing is waiting in the queue.';

/**
 * The seam for the next step.
 *
 * Today this only logs: approval is a row in `gt-ops`, and a human opens the draft record in
 * `datasets`. A later change replaces the body with a call to the GitHub App that files the
 * data-submission issue (or the `kayda-gec` labelled draft PR) and writes the resulting
 * `drafts` row. Keeping it as one named function means that change touches one place, and that
 * the promotion path stays visible to anyone reading the bot.
 */
export async function onApproved({ reviewId, reviewerId }) {
  console.log('review-bot: approved for draft', JSON.stringify({ reviewId, reviewerId }));
  return { opened: false, reason: 'draft records are opened in GitHub by a human' };
}

async function sendCandidate(ctx, review) {
  const signals = await signalsByHash(ctx.config, [review.content_hash]);
  const signal = signals.get(review.content_hash) ?? null;
  const markup = review.status === 'queued' ? keyboardFor(review.id) : null;
  const sent = await ctx.tg.sendMessage(renderCandidate(review, signal), { replyMarkup: markup });
  if (sent && Number.isInteger(sent.message_id)) {
    await rememberMessageId(ctx.config, { reviewId: review.id, messageId: sent.message_id });
  }
  return sent;
}

async function cmdQueue(ctx) {
  const reviews = await nextReviews(ctx.config, { limit: ctx.config.pageSize });
  const signals = await signalsByHash(
    ctx.config,
    reviews.map((review) => review.content_hash),
  );
  const total = await countQueued(ctx.config);
  await ctx.tg.sendMessage(renderQueue(reviews, signals, { total }));
}

async function cmdNext(ctx) {
  const [review] = await nextReviews(ctx.config, { limit: 1 });
  if (!review) {
    await ctx.tg.sendMessage(EMPTY_QUEUE);
    return;
  }
  await sendCandidate(ctx, review);
}

async function cmdShow(ctx, args) {
  const raw = args[0] ?? '';
  if (!/^#?\d{1,15}$/u.test(raw)) {
    await ctx.tg.sendMessage('Kullanım / usage: /goster &lt;id&gt;');
    return;
  }
  const review = await reviewById(ctx.config, Number(raw.replace('#', '')));
  if (!review) {
    await ctx.tg.sendMessage('Böyle bir öğe yok. / No such item.');
    return;
  }
  await sendCandidate(ctx, review);
}

async function cmdStatus(ctx) {
  await ctx.tg.sendMessage(renderStatus(await statusCounts(ctx.config)));
}

async function cmdHelp(ctx) {
  await ctx.tg.sendMessage(renderHelp());
}

const COMMANDS = new Map([
  ['/kuyruk', cmdQueue],
  ['/queue', cmdQueue],
  ['/sonraki', cmdNext],
  ['/next', cmdNext],
  ['/goster', cmdShow],
  ['/show', cmdShow],
  ['/durum', cmdStatus],
  ['/status', cmdStatus],
  ['/yardim', cmdHelp],
  ['/help', cmdHelp],
  ['/start', cmdHelp],
]);

async function handleMessage(update, ctx) {
  const text = update.message?.text;
  if (typeof text !== 'string' || !text.startsWith('/')) return { handled: false };
  const [head, ...args] = text.trim().split(/\s+/u);
  const name = head.split('@')[0].toLocaleLowerCase('tr');
  const command = COMMANDS.get(name);
  if (!command) {
    await ctx.tg.sendMessage(UNKNOWN_COMMAND);
    return { handled: true, command: null };
  }
  await command(ctx, args);
  return { handled: true, command: name };
}

async function handleCallback(update, ctx) {
  const query = update.callback_query;
  const parsed = parseCallbackData(query?.data);
  if (!parsed) {
    await ctx.tg.answerCallbackQuery(query?.id, 'Anlaşılmadı. / Not understood.');
    return { handled: false };
  }

  // A decision needs a reviewer row. The bot cannot create one: `reviewers` is filled by a
  // maintainer and holds no name and no contact detail.
  const reviewer = await activeReviewer(ctx.config, query.from.id);
  if (!reviewer) {
    await ctx.tg.answerCallbackQuery(query.id, 'Gözden geçirici kaydı yok. / No reviewer record.');
    await ctx.tg.sendMessage(NOT_A_REVIEWER);
    return { handled: true, action: parsed.action, wrote: false };
  }

  const review = await reviewById(ctx.config, parsed.reviewId);
  if (!review) {
    await ctx.tg.answerCallbackQuery(query.id, 'Böyle bir öğe yok. / No such item.');
    return { handled: true, action: parsed.action, wrote: false };
  }
  if (review.status !== 'queued') {
    await ctx.tg.answerCallbackQuery(query.id, ALREADY_DECIDED);
    await ctx.tg.clearButtons(query.message?.message_id);
    return { handled: true, action: parsed.action, wrote: false };
  }

  if (parsed.action === 'sonra') {
    await recordSkip(ctx.config, { reviewId: review.id, reviewerId: reviewer.id });
    await ctx.tg.answerCallbackQuery(query.id, '⏭ Sonra / skipped');
    await ctx.tg.clearButtons(query.message?.message_id);
    const [next] = await nextReviews(ctx.config, {
      limit: 1,
      after: { createdAt: review.created_at, id: review.id },
    });
    if (next) await sendCandidate(ctx, next);
    else await ctx.tg.sendMessage(EMPTY_QUEUE);
    return { handled: true, action: 'sonra', wrote: true };
  }

  const status = parsed.action === 'onayla' ? 'drafted' : 'dismissed';
  const wrote = await recordDecision(ctx.config, {
    reviewId: review.id,
    reviewerId: reviewer.id,
    status,
  });
  if (!wrote) {
    await ctx.tg.answerCallbackQuery(query.id, ALREADY_DECIDED);
    return { handled: true, action: parsed.action, wrote: false };
  }
  await ctx.tg.clearButtons(query.message?.message_id);
  if (status === 'drafted') {
    await onApproved({ reviewId: review.id, reviewerId: reviewer.id });
    await ctx.tg.answerCallbackQuery(
      query.id,
      '✅ Taslağa onaylandı. Yayımlanmadı. / Approved for a draft. Nothing was published.',
    );
  } else {
    await ctx.tg.answerCallbackQuery(query.id, '🚫 Reddedildi / dismissed');
  }
  return { handled: true, action: parsed.action, wrote: true, status };
}

/** Route one authenticated update. */
export async function handleUpdate(update, ctx) {
  if (update.callback_query) return handleCallback(update, ctx);
  if (update.message) return handleMessage(update, ctx);
  return { handled: false };
}
