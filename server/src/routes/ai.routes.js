const express = require('express');

const { ping, listingDraft, reviewSummary } = require('../controllers/ai.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
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

module.exports = router;
