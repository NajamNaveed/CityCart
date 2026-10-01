const express = require('express');

const { getForOrder, updateStatus } = require('../controllers/payment.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { forBrandUsers, BRAND_ROLES } = require('../middleware/forBrandUsers');
const { paymentWriteLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Read: customer (own order), brand with payments.view (own orders), super admin.
router.get(
  '/order/:orderId',
  authenticate,
  requireRole(ROLES.CUSTOMER, ROLES.SUPER_ADMIN, ...BRAND_ROLES),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_VIEW)),
  forBrandUsers(requireTenant),
  getForOrder
);

// Write: heavily protected (docs/05 §22). Customers can never change payment
// status. Brand users need payments.manage; super admin is unscoped.
router.patch(
  '/:id/status',
  paymentWriteLimiter,
  authenticate,
  requireRole(ROLES.SUPER_ADMIN, ...BRAND_ROLES),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_MANAGE)),
  forBrandUsers(requireTenant),
  updateStatus
);

module.exports = router;
