const { z } = require('zod');

const env = require('../config/env');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
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
const {
  matchCatalogue,
  CatalogueMatchError,
  QUERY_LIMIT: CATALOGUE_QUERY_LIMIT,
} = require('../services/ai/agents/catalogueMatch.agent');
const { cleanCsv, CsvCleanError } = require('../services/ai/agents/csvClean.agent');
const {
  draftReply,
  ReplyDraftError,
  TYPES: REPLY_TYPES,
} = require('../services/ai/agents/replyDraft.agent');
const {
  returnsInsights: clusterReturnsInsights,
  ReturnsInsightsError,
  DEFAULT_DAYS: RETURNS_DEFAULT_DAYS,
  DAY_RANGE: RETURNS_DAY_RANGE,
} = require('../services/ai/agents/returnsInsights.agent');
const {
  restockCalendar: readRestockCalendar,
  RestockCalendarError,
  DEFAULT_WEEKS: RESTOCK_DEFAULT_WEEKS,
  MIN_WEEKS: RESTOCK_MIN_WEEKS,
  MAX_WEEKS: RESTOCK_MAX_WEEKS,
} = require('../services/ai/agents/restockCalendar.agent');
const {
  listingQuality: readListingQuality,
  ListingQualityError,
} = require('../services/ai/agents/listingQuality.agent');
const {
  shopReport: readShopReport,
  ShopReportError,
  DEFAULT_DAYS: REPORT_DEFAULT_DAYS,
  MIN_DAYS: REPORT_MIN_DAYS,
  MAX_DAYS: REPORT_MAX_DAYS,
} = require('../services/ai/agents/shopReport.agent');
const { CsvImportError } = require('../services/productCsv.service');
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

const catalogueMatchSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2, 'Type the product name or a few words about it.')
      .max(CATALOGUE_QUERY_LIMIT, `Keep it under ${CATALOGUE_QUERY_LIMIT} characters.`),
    barcode: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z-]{6,40}$/, 'A barcode is 6-40 digits, letters or dashes.')
      .optional(),
    categoryName: z.string().trim().max(80).optional(),
  })
  // A brand id in the body is not merely ignored, it is refused: the shop
  // behind a search always comes from requireTenant.
  .strict();

/**
 * Phase 3b: the catalogue matcher. The brand is taken from requireTenant, so
 * the reads are this shop's catalogue view and this shop's own listings only.
 * Nothing here creates or merges a product: the shop still clicks the ordinary
 * "use this product" or "send request" buttons.
 */
async function catalogueMatch(req, res, next) {
  const parsed = catalogueMatchSchema.safeParse(req.body);
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
    const data = await matchCatalogue({
      query: parsed.data.query,
      barcode: parsed.data.barcode || null,
      categoryName: parsed.data.categoryName || null,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof CatalogueMatchError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

/**
 * The limit the importer itself accepts, so a file that can be cleaned can also
 * be imported — and a file that cannot be imported is not cleaned either.
 */
const CSV_CLEAN_LIMIT = 1_000_000;

const csvCleanSchema = z
  .string()
  .trim()
  .min(4, 'Upload the CSV file first.')
  .max(CSV_CLEAN_LIMIT, 'This file is too large for one check. Split it into smaller files.');

/**
 * Phase 3b: the CSV cleaner. The file is the request body, exactly like
 * POST /products/import, so the diff describes the bytes the shop is about to
 * import rather than a copy of them, and the 1mb cap is the importer's own.
 * Nothing is written: the shop puts the cleaned text back through the ordinary
 * check and import buttons.
 */
async function csvClean(req, res, next) {
  if (typeof req.body !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Send the file as text/csv, the same way the import does.',
    });
  }
  const parsed = csvCleanSchema.safeParse(req.body);
  if (!parsed.success) {
    // The body is the file itself, so there is no field to report — the first
    // reason is the one the shop needs to see.
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Upload the CSV file first.',
    });
  }

  if (!req.tenantBrandId) {
    return res.status(403).json({ success: false, message: 'This needs a brand account.', code: 'NO_BRAND' });
  }

  try {
    const data = await cleanCsv({
      csv: parsed.data,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    // A file the importer would refuse is refused here too, with the same words,
    // because the cleaner reads it with the importer's own rules.
    if (err instanceof CsvCleanError || err instanceof CsvImportError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const replyDraftSchema = z.object({
  type: z.enum(REPLY_TYPES, { error: 'Choose what to reply to.' }),
  id: z.string().trim().min(1, 'Choose a review or a conversation.').max(64),
});

// The two halves answer about two different parts of the shop's own screens,
// so each needs the permission that screen already runs on: the review list is
// products.view, replying to a customer is messages.manage. The route's
// requirePermission lets a holder of either in; the requested type still has
// to be one this person may do.
const REPLY_PERMISSIONS = {
  review: PERMISSIONS.PRODUCTS_VIEW,
  chat: PERMISSIONS.MESSAGES_MANAGE,
};

function holdsBrandPermission(req, permission) {
  if (req.user.role === ROLES.BRAND_ADMIN) return true;
  return Boolean(req.employee?.permissions?.includes(permission));
}

/**
 * Phase 3c: draft the shop's reply to one of its own reviews or chats. Only the
 * id travels in the body — the review, the thread and the customer come from
 * the caller's tenant, so a body can never name another shop's row or carry a
 * forged history. The response is text and nothing more: the chat draft lands
 * in the composer and the shop sends it through POST /chats/:id/messages,
 * which re-checks membership, permissions and whether the seller is open.
 */
async function replyDraft(req, res, next) {
  const parsed = replyDraftSchema.safeParse(req.body);
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

  const permission = REPLY_PERMISSIONS[parsed.data.type];
  if (!holdsBrandPermission(req, permission)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to perform this action.',
      code: 'PERMISSION_DENIED',
      permission,
    });
  }

  try {
    const data = await draftReply({
      ...parsed.data,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof ReplyDraftError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const returnsInsightsSchema = z.object({
  days: z
    .number()
    .int()
    .min(RETURNS_DAY_RANGE.min)
    .max(RETURNS_DAY_RANGE.max)
    .optional()
    .default(RETURNS_DEFAULT_DAYS),
  returnId: z.string().trim().min(1, 'Choose a return.').max(64).optional(),
});

/**
 * Phase 3d-1: why this shop's orders come back. Nothing identifying travels in
 * the body but an optional return id, and that id is read inside the caller's
 * tenant, so another shop's refusal cannot be named. The counts come from
 * `returnsStats.rules`, never from the model, and a theme whose reason is not
 * in those counts is dropped. The drafted reply is text only — the shop's real
 * action stays POST /returns/:id/receive.
 */
async function returnsInsights(req, res, next) {
  const parsed = returnsInsightsSchema.safeParse(req.body || {});
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

  if (!holdsBrandPermission(req, PERMISSIONS.DELIVERY_VIEW)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to perform this action.',
      code: 'PERMISSION_DENIED',
      permission: PERMISSIONS.DELIVERY_VIEW,
    });
  }

  try {
    const data = await clusterReturnsInsights({
      ...parsed.data,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof ReturnsInsightsError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const restockCalendarSchema = z.object({
  weeks: z
    .number()
    .int()
    .min(RESTOCK_MIN_WEEKS)
    .max(RESTOCK_MAX_WEEKS)
    .optional()
    .default(RESTOCK_DEFAULT_WEEKS),
});

/**
 * Phase 3d-2: what this shop should have bought last week. The only input is a
 * window length; the orders, the weeks and the stock rows are all read inside
 * the tenant `requireTenant` resolved from the session, so no body can aim this
 * at another shop's catalogue. The weekly counts, cover and suggested units come
 * from `restockCalendar.rules`, and a watched product whose id is not in that
 * table is dropped. Nothing here buys, restocks or reserves anything.
 */
async function restockCalendar(req, res, next) {
  const parsed = restockCalendarSchema.safeParse(req.body || {});
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

  if (!holdsBrandPermission(req, PERMISSIONS.ANALYTICS_VIEW)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to perform this action.',
      code: 'PERMISSION_DENIED',
      permission: PERMISSIONS.ANALYTICS_VIEW,
    });
  }

  try {
    const data = await readRestockCalendar({
      ...parsed.data,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof RestockCalendarError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const listingQualitySchema = z.object({
  productId: z.string().trim().min(1, 'Choose a listing to score.').max(64),
});

/**
 * Phase 3d-3: why this page is not selling. One id in, one listing out — and
 * the id is only ever read inside the tenant `requireTenant` resolved from the
 * session, so another shop's listing scores nothing, says nothing and 404s the
 * same way this shop's own missing listing does. The score itself is arithmetic
 * from `listingQuality.rules`; the model only re-words the gaps that arithmetic
 * found, and a fix naming a field with no gap is dropped here. Nothing is saved
 * to the listing.
 */
async function listingQuality(req, res, next) {
  const parsed = listingQualitySchema.safeParse(req.body || {});
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

  if (!holdsBrandPermission(req, PERMISSIONS.PRODUCTS_VIEW)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to perform this action.',
      code: 'PERMISSION_DENIED',
      permission: PERMISSIONS.PRODUCTS_VIEW,
    });
  }

  try {
    const data = await readListingQuality({
      ...parsed.data,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof ListingQualityError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

const shopReportSchema = z.object({
  days: z
    .number()
    .int()
    .min(REPORT_MIN_DAYS)
    .max(REPORT_MAX_DAYS)
    .optional()
    .default(REPORT_DEFAULT_DAYS),
});

/**
 * Phase 3d-4: how the shop's week went. The only input is a window length, and
 * both this week and the equal week before it are read through the dashboard's
 * own analytics service inside the tenant `requireTenant` resolved from the
 * session — so no body can aim the report at another shop, and no rupee or
 * order count in the answer is the model's recollection. The comparison is
 * aligned weekday to weekday with the in-progress day left out of both sides,
 * because a part-day measured against a finished week always reads as a decline.
 * Nothing is stored, mailed or scheduled.
 */
async function shopReport(req, res, next) {
  const parsed = shopReportSchema.safeParse(req.body || {});
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

  if (!holdsBrandPermission(req, PERMISSIONS.ANALYTICS_VIEW)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to perform this action.',
      code: 'PERMISSION_DENIED',
      permission: PERMISSIONS.ANALYTICS_VIEW,
    });
  }

  try {
    const data = await readShopReport({
      ...parsed.data,
      ctx: { userId: req.user._id, role: req.user.role, brandId: req.tenantBrandId },
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err instanceof ShopReportError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
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
  replyDraft,
  returnsInsights,
  restockCalendar,
  listingQuality,
  shopReport,
  sellerAdvisor,
  catalogueMatch,
  csvClean,
};