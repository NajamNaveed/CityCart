const crypto = require('crypto');
const { z } = require('zod');

const { generate } = require('../index');
const { getCached, setCached } = require('../cache');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { inspectText, rulesReason, cleanReason, MAX_TEXT } = require('../moderation.rules');
const { buildModerationMessages } = require('../prompts/moderation.prompt');

/**
 * On-demand moderation check (docs/29 Phase 4c).
 *
 * The administrator pastes one piece of text and reads a score, labels and a
 * sentence. The score and labels come from `moderation.rules.js`; the model
 * only writes the sentence, and a failed or refused generation falls back to
 * the rules sentence with `degraded: true`.
 *
 * Nothing is written, hidden, blocked, reported or notified. No model is
 * loaded from the database and no record is read, because the caller already
 * holds the text and an internal check must not be able to reach a review, a
 * listing or another shop's data through an id in the body.
 */

const modelSchema = z.object({
  reason: z.string().trim().min(10).max(280),
});

// A day is enough: the same words read by another administrator within a day
// get the same answer, and a phrase that becomes acceptable tomorrow is
// re-read from scratch. The key is a hash so the checked text is not stored.
const CACHE_TTL_SECONDS = 60 * 60 * 24;

function cacheKeyOf(text) {
  const digest = crypto.createHash('sha256').update(text).digest('hex');
  return `moderation:${digest}`;
}

async function moderateText({ text, ctx }) {
  const safe = sanitizeUserText(typeof text === 'string' ? text : '', MAX_TEXT);
  const result = inspectText(safe);
  const fallback = rulesReason(result.labels);
  const base = {
    score: result.score,
    verdict: result.verdict,
    labels: result.labels,
    reason: fallback,
    degraded: false,
  };

  // An empty string after tag/whitespace removal has nothing for a provider to
  // read; the rules answer is already complete.
  if (!safe) return base;

  const key = cacheKeyOf(safe);
  const cached = await getCached(key);
  // Only the model's sentence is cached; the score, labels and verdict are
  // always recomputed from the current rules, so a rules change applies at once.
  if (cached && typeof cached.reason === 'string') return { ...base, reason: cached.reason };

  try {
    const generated = await generate({
      task: 'moderation',
      messages: buildModerationMessages({
        text: safe,
        score: result.score,
        labels: result.labels,
        verdict: result.verdict,
      }),
      json: true,
      temperature: 0.2,
      maxTokens: 160,
      userId: ctx.userId,
      role: ctx.role,
    });
    const parsed = parseModelJson(generated.text, modelSchema);
    const reason = cleanReason(parsed.reason, fallback);
    // A degraded answer is not cached, so a provider that was down is tried
    // again next time instead of freezing the fallback sentence for a day.
    await setCached(key, { reason }, CACHE_TTL_SECONDS);
    return { ...base, reason };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE' || err.name === 'AiGuardError') {
      return { ...base, degraded: true };
    }
    throw err;
  }
}

module.exports = { moderateText, cacheKeyOf };
