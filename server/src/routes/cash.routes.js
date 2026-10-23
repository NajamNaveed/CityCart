const express = require('express');

const { outstanding, settle } = require('../controllers/cash.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { BRAND_ROLES } = require('../middleware/forBrandUsers');
const { paymentWriteLimiter } = require('../middleware/rateLimiters');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Brand users only, pinned to their own brand. Reading who holds cash needs
// payments.view; confirming a hand-over moves money records, so it needs
// payments.manage like every other payment change.
router.get('/outstanding', authenticate, requireRole(...BRAND_ROLES), requirePermission(PERMISSIONS.PAYMENTS_VIEW), requireTenant, outstanding);
router.post(
  '/settle',
  paymentWriteLimiter,
  authenticate,
  requireRole(...BRAND_ROLES),
  requirePermission(PERMISSIONS.PAYMENTS_MANAGE),
  requireTenant,
  settle
);

module.exports = router;
