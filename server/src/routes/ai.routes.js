const express = require('express');

const { ping, listingDraft, reviewSummary, translate, shopAssistant, orderHelper } = require('../controllers/ai.controller');
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

module.exports = router;
