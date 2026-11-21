const { z } = require('zod');

const env = require('../config/env');
const { countUsageToday } = require('../services/ai/usage');
const { draftListing, NOTES_LIMIT } = require('../services/ai/agents/listing.agent');
const { draftReviewSummary, ReviewSummaryError } = require('../services/ai/agents/reviewSummary.agent');
const { translateMessage, TranslateError, TARGET_LANGS } = require('../services/ai/agents/translate.agent');
const { askShopAssistant, MESSAGE_LIMIT: ASSISTANT_MESSAGE_LIMIT } = require('../services/ai/agents/shopAssistant.agent');
const { askOrderHelper, MESSAGE_LIMIT: ORDER_MESSAGE_LIMIT } = require('../services/ai/agents/orderHelper.agent');
const {
  askServiceHelper,
  MESSAGE_LIMIT: SERVICE_MESSAGE_LIMIT,
} = require('../services/ai/agents/serviceHelper.agent');
const {
  buildRecipeList,
  TEXT_LIMIT: RECIPE_TEXT_LIMIT,
} = require('../services/ai/agents/recipe.agent');
const {
  compareProducts,
  MESSAGE_LIMIT: COMPARE_MESSAGE_LIMIT,
} = require('../services/ai/agents/compare.agent');
const { askCityCart } = require('../services/ai/agents/chat.agent');
const {
  askSellerAdvisor,
  MESSAGE_LIMIT: SELLER_MESSAGE_LIMIT,
} = require('../services/ai/agents/sellerAdvisor.agent');
const { ROUTABLE_MODES, MAX_MESSAGE_CHARS } = require('../services/ai/intent');
const {
  draftChatMessage,
  ChatDraftError,
  KINDS: DRAFT_KINDS,
  INTENT_LIMIT: DRAFT_INTENT_LIMIT,
} = require('../services/ai/agents/chatDraft.agent');
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

const orderHelperSchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, 'Ask a question first.')
    .max(ORDER_MESSAGE_LIMIT, `Keep the question under ${ORDER_MESSAGE_LIMIT} characters.`),
});

/**
 * Phase 2b: the order helper. Its tools read only the signed-in customer's own
 * orders, and the suggested actions are built by the server rules, never by the
 * model. The customer still performs the action on the normal order page.
 */
async function orderHelper(req, res, next) {
  const parsed = orderHelperSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await askOrderHelper({
      message: parsed.data.message,
      ctx: { userId: req.user._id, role: req.user.role },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

const serviceHelperSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(2, 'Ask a question first.')
      .max(SERVICE_MESSAGE_LIMIT, `Keep the question under ${SERVICE_MESSAGE_LIMIT} characters.`),
    cityId: z.string().regex(/^[0-9a-f]{24}$/i, 'Choose a valid city.').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both coordinates or neither.',
    path: ['lat'],
  });

/**
 * Phase 2c: the service booking helper. It only reads public providers and
 * their published availability; suggested times are generated by the server,
 * and booking still goes through the provider's normal booking flow.
 */
async function serviceHelper(req, res, next) {
  const parsed = serviceHelperSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await askServiceHelper({
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

const recipeListSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(3, 'Describe the dish or paste a recipe.')
      .max(RECIPE_TEXT_LIMIT, `Keep the recipe under ${RECIPE_TEXT_LIMIT} characters.`),
    cityId: z.string().regex(/^[0-9a-f]{24}$/i, 'Choose a valid city.').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both coordinates or neither.',
    path: ['lat'],
  });

/**
 * Phase 2d: recipe -> shopping list. The model extracts the dish name and its
 * ingredients only; every product, price and shop in the list comes from the
 * ordinary public product search. Adding the list to the cart is still the
 * customer's action through the normal cart endpoints.
 */
async function recipeList(req, res, next) {
  const parsed = recipeListSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await buildRecipeList({
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

const compareSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(3, 'Say which products to compare.')
      .max(COMPARE_MESSAGE_LIMIT, `Keep the question under ${COMPARE_MESSAGE_LIMIT} characters.`),
    cityId: z.string().regex(/^[0-9a-f]{24}$/i, 'Choose a valid city.').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both coordinates or neither.',
    path: ['lat'],
  });

/**
 * Phase 2e: a side-by-side product comparison. The cards come from the
 * comparison tool's results only, enriched with the listing's own attributes
 * and its approved-review rating. The model may describe the differences but
 * cannot add a product, price or attribute of its own.
 */
async function compare(req, res, next) {
  const parsed = compareSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await compareProducts({
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

const chatSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(2, 'Ask a question first.')
      .max(MAX_MESSAGE_CHARS, `Keep the question under ${MAX_MESSAGE_CHARS} characters.`),
    cityId: z.string().regex(/^[0-9a-f]{24}$/i, 'Choose a valid city.').optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    // Only a hint for short follow-ups; the server still decides the mode.
    lastMode: z.enum(ROUTABLE_MODES).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both coordinates or neither.',
    path: ['lat'],
  });

/**
 * Phase 2g: the single customer chat. One message is routed server-side to the
 * shopping, order, service, recipe or comparison agent, and the answer carries
 * its mode so the client renders the right cards. A greeting or "help" answers
 * with the capability hints without spending a provider call.
 */
async function chat(req, res, next) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await askCityCart({
      message: parsed.data.message,
      ctx: { userId: req.user._id, role: req.user.role },
      cityId: parsed.data.cityId || null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      lastMode: parsed.data.lastMode || null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

const chatDraftSchema = z.object({
  kind: z.enum(DRAFT_KINDS, { error: 'Choose a conversation type.' }),
  id: z.string().trim().min(1, 'Choose a conversation.').max(64),
  intent: z
    .string()
    .trim()
    .min(3, 'Say what you want to ask.')
    .max(DRAFT_INTENT_LIMIT, `Keep it under ${DRAFT_INTENT_LIMIT} characters.`),
});

/**
 * Phase 2f: draft the next message in a provider or booking thread. The client
 * sends the thread kind and id plus a short intent; the agent loads the
 * conversation itself, so the request can never inject someone else's messages
 * or a fake history. The draft is only text in the composer until the customer
 * sends it through the ordinary chat endpoint.
 */
async function chatDraft(req, res, next) {
  const parsed = chatDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const data = await draftChatMessage({
      ...parsed.data,
      ctx: { userId: req.user._id, role: req.user.role },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof ChatDraftError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const sellerAdvisorSchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, 'Ask a question first.')
    .max(SELLER_MESSAGE_LIMIT, `Keep the question under ${SELLER_MESSAGE_LIMIT} characters.`),
});

/**
 * Phase 3a: the seller advisor. requireTenant already put the caller's own
 * brand on the request, and that — never the body — is what the tools read, so
 * a shop cannot ask about another shop. Anything that could change a listing,
 * a price or a stock level stays on the ordinary brand screens.
 */
async function sellerAdvisor(req, res, next) {
  const parsed = sellerAdvisorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  if (!req.tenantBrandId) {
    return res.status(403).json({ success: false, message: 'This needs a brand account.', code: 'NO_BRAND' });
  }

  try {
    const data = await askSellerAdvisor({
      message: parsed.data.message,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  ping,
  listingDraft,
  reviewSummary,
  translate,
  shopAssistant,
  orderHelper,
  serviceHelper,
  recipeList,
  compare,
  chatDraft,
  chat,
  sellerAdvisor,
};