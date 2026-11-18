const express = require('express');

const {
  ping,
  listingDraft,
  reviewSummary,
  translate,
  shopAssistant,
  orderHelper,
  serviceHelper,
  recipeList,
} = require('../controllers/ai.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { chatAccess } = require('../middleware/chatAccess');
const { ROLES } = require('../config/roles');
const { requireAiEnabled, aiDailyLimit } = require('../middleware/aiAccess');
const { aiUserLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Signed-in first, then role, then the kill switch, then the per-user burst
// cap, then the daily allowance (docs/29 Phase 0c). Later agent routes reuse
// this chain.
router.post('/ping', authenticate, requireAiEnabled, aiUserLimiter, aiDailyLimit, ping);

router.post(
  '/listing-draft',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  listingDraft,
);

router.get(
  '/products/:id/review-summary',
  authenticate,
  validateObjectIdParam,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  reviewSummary,
);

// Store chat only (customer and brand team). chatAccess rejects every other
// role before the message is even loaded; the agent then checks that the
// caller is a participant of the message's own conversation.
router.post(
  '/translate',
  authenticate,
  chatAccess,
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  translate,
);

// Phase 2a: the customer shopping assistant. It may call several tools per
// question, so the daily allowance is spent per provider call (see docs/05 §23a).
router.post(
  '/shop-assistant',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  shopAssistant,
);

// Phase 2b: questions about the caller's own orders. The tools take the
// customer id from the authenticated request; no id is ever read from the body.
router.post(
  '/order-helper',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  orderHelper,
);

// Phase 2c: find a service provider and its free times. The tools only read
// public provider data and published availability; no booking is created.
router.post(
  '/service-helper',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  serviceHelper,
);

// Phase 2d: recipe -> shopping list. The model only extracts ingredients; the
// products in the list come from the ordinary public search, and the shopper
// adds them through the normal cart.
router.post(
  '/recipe-list',
  authenticate,
  requireRole(ROLES.CUSTOMER),
  requireAiEnabled,
  aiUserLimiter,
  aiDailyLimit,
  recipeList,
);

module.exports = router;
