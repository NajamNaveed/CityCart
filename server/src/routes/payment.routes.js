const express = require('express');

const { getForOrder, updateStatus, proofs, proofLink, decide } = require('../controllers/payment.controller');
const { methods, startCheckout, webhook, mockPage, mockComplete, events } = require('../controllers/onlinePayment.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const requireTenant = require('../middleware/requireTenant');
const { forBrandUsers, BRAND_ROLES } = require('../middleware/forBrandUsers');
const { paymentWriteLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// --- Online payments (docs/10 §29) ---
// What the customer can pay with.
router.get('/methods', authenticate, requireRole(ROLES.CUSTOMER), methods);

// The customer starts paying one of their own online orders and is sent to the gateway.
router.post('/order/:orderId/checkout', paymentWriteLimiter, authenticate, requireRole(ROLES.CUSTOMER), startCheckout);

// The gateway's notification. Not a user request: it is authenticated by its signature over the
// raw body (see app.js for how the raw body is kept), checked before anything else happens.
router.post('/webhooks/:provider', webhook);

// The built-in TEST gateway's hosted page. Answers 404 unless the test gateway is on.
router.get('/mock-checkout/:reference', mockPage);
router.post('/mock-checkout/:reference/:choice', mockComplete);

// What the gateway told us, including late payments and mismatches that need a
// human. Super admin, or a partner with admin.payments.
router.get('/events', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS), events);

// Read: customer (own order), brand with payments.view (own orders), platform admin.
router.get(
  '/order/:orderId',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS, { allowRoles: [ROLES.CUSTOMER, ...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_VIEW)),
  forBrandUsers(requireTenant),
  getForOrder
);

// --- Door-collected payments and their proof (docs/21 §I) ---
// Non-cash collected at the door waits in "payments to verify" until someone
// with payments.view checks it against the brand's statement.
router.get(
  '/proofs',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS, { allowRoles: [...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_VIEW)),
  forBrandUsers(requireTenant),
  proofs
);

// A short-lived signed link; the photo itself is never public and never stored
// in the app. Scoped to the caller's brand by the service.
router.get(
  '/:id/proof',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS, { allowRoles: [...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_VIEW)),
  forBrandUsers(requireTenant),
  proofLink
);

// Verifying or rejecting a proof moves money records, so it needs payments.manage.
router.patch(
  '/:id/proof',
  paymentWriteLimiter,
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS, { allowRoles: [...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_MANAGE)),
  forBrandUsers(requireTenant),
  decide
);

// Write: heavily protected (docs/05 §22). Customers can never change payment
// status. Brand users need payments.manage; platform admins are unscoped.
router.patch(
  '/:id/status',
  paymentWriteLimiter,
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS, { allowRoles: [...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_MANAGE)),
  forBrandUsers(requireTenant),
  updateStatus
);

module.exports = router;
