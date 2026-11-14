const { z } = require('zod');

const env = require('../config/env');
const { countUsageToday } = require('../services/ai/usage');
const { draftListing, NOTES_LIMIT } = require('../services/ai/agents/listing.agent');
const { draftReviewSummary, ReviewSummaryError } = require('../services/ai/agents/reviewSummary.agent');
const { formatZodError } = require('../utils/formatZodError');

/**
 * Phase 0 connectivity check. It answers only for a signed-in user, does not
 * call a provider and does not consume the daily allowance, so the web/app can
 * show "AI is off / out of quota" states without spending a request.
 */
async function ping(req, res, next) {
  try {
    const usedToday = await countUsageToday(req.user._id);
    return res.status(200).json({
      success: true,
      data: {
        dailyLimit: env.ai.dailyLimit,
        usedToday,
        remaining: Math.max(0, env.ai.dailyLimit - usedToday),
      },
    });
  } catch (err) {
    return next(err);
  }
}

const listingDraftSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(3, 'Add a few words about the product.')
    .max(NOTES_LIMIT, `Keep the notes under ${NOTES_LIMIT} characters.`),
});

/**
 * Phase 1a: a draft only. The brand edits it and sends the normal catalogue
 * request, so nothing here writes to the database.
 */
async function listingDraft(req, res, next) {
  const parsed = listingDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await draftListing({
      notes: parsed.data.notes,
      ctx: { userId: req.user._id, role: req.user.role },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/**
 * Phase 1b: a read-only summary of a product's approved reviews. Guests get
 * the reviews themselves from the public endpoint; this one is signed-in so
 * every provider call is attributable and covered by the daily allowance.
 */
async function reviewSummary(req, res, next) {
  try {
    const data = await draftReviewSummary({
      productId: req.params.id,
      ctx: { userId: req.user._id, role: req.user.role },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof ReviewSummaryError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { ping, listingDraft, reviewSummary };
