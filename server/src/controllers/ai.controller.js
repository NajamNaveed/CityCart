const { z } = require('zod');

const env = require('../config/env');
const { countUsageToday } = require('../services/ai/usage');
const { draftListing, NOTES_LIMIT } = require('../services/ai/agents/listing.agent');
const { draftReviewSummary, ReviewSummaryError } = require('../services/ai/agents/reviewSummary.agent');
const { translateMessage, TranslateError, TARGET_LANGS } = require('../services/ai/agents/translate.agent');
const { askShopAssistant, MESSAGE_LIMIT: ASSISTANT_MESSAGE_LIMIT } = require('../services/ai/agents/shopAssistant.agent');
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

const translateSchema = z.object({
  messageId: z.string().trim().min(1, 'Choose a message.').max(64),
  targetLang: z.enum(TARGET_LANGS, { error: 'Choose English, Urdu or Roman Urdu.' }),
});

/**
 * Phase 1c: translate one chat message on request. chatAccess already decided
 * whether the caller may read that chat family; the agent then loads the
 * message and checks the caller is a participant of its own conversation.
 */
async function translate(req, res, next) {
  const parsed = translateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await translateMessage({ ...parsed.data, chat: req.chat });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof TranslateError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const shopAssistantSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(2, 'Ask a question first.')
      .max(ASSISTANT_MESSAGE_LIMIT, `Keep the question under ${ASSISTANT_MESSAGE_LIMIT} characters.`),
    cityId: z.string().regex(/^[0-9a-f]{24}$/i, 'Choose a valid city.').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both coordinates or neither.',
    path: ['lat'],
  });

/**
 * Phase 2a: the shopping assistant. The model may search products, categories
 * and nearby shops; the response cards come from the tool results, never from
 * the model's own ids. A provider outage falls back to a plain search.
 */
async function shopAssistant(req, res, next) {
  const parsed = shopAssistantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await askShopAssistant({
      message: parsed.data.message,
      ctx: { userId: req.user._id, role: req.user.role },
      cityId: parsed.data.cityId || null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = { ping, listingDraft, reviewSummary, translate, shopAssistant };