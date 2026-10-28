const express = require('express');

const { list, getById, updateStatus, update, assign, getCode, riderLocation } = require('../controllers/delivery.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const requireTenant = require('../middleware/requireTenant');
const { ROLES } = require('../config/roles');
const { forBrandUsers, BRAND_ROLES } = require('../middleware/forBrandUsers');
const { PERMISSIONS } = require('../config/permissions');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

const brandUser = [authenticate, requireRole(...BRAND_ROLES)];

router.get('/', ...brandUser, requirePermission(PERMISSIONS.DELIVERY_VIEW), requireTenant, list);

// The customer's proof-of-delivery code (docs/11 §19): the customer, and
// nobody else, can read it.
router.get('/:id/code', authenticate, requireRole(ROLES.CUSTOMER), getCode);

// Where the rider is (docs/11 §30): the order's customer, and the brand's staff with delivery.view.
// Only while the delivery is out for delivery; the controller looks the delivery up with the caller's own scope.
router.get(
  '/:id/rider-location',
  authenticate,
  requireRole(ROLES.CUSTOMER, ...BRAND_ROLES),
  forBrandUsers(requirePermission(PERMISSIONS.DELIVERY_VIEW)),
  forBrandUsers(requireTenant),
  riderLocation
);

router.get(
  '/:id',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.ORDERS, { allowRoles: [ROLES.CUSTOMER, ...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.DELIVERY_VIEW)),
  forBrandUsers(requireTenant),
  getById
);

router.patch(
  '/:id/status',
  ...brandUser,
  requirePermission(PERMISSIONS.DELIVERY_MANAGE),
  requireTenant,
  updateStatus
);

router.patch(
  '/:id/rider',
  ...brandUser,
  requirePermission(PERMISSIONS.DELIVERY_MANAGE),
  requireTenant,
  assign
);

router.patch(
  '/:id',
  ...brandUser,
  requirePermission(PERMISSIONS.DELIVERY_MANAGE),
  requireTenant,
  update
);

module.exports = router;
