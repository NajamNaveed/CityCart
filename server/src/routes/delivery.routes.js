const express = require('express');

const { list, getById, updateStatus, update } = require('../controllers/delivery.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

const BRAND_ROLES = [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE];
const brandUser = [authenticate, requireRole(...BRAND_ROLES)];

// Applies a brand-only middleware (permission / tenant) to brand users and
// lets customers and super admins straight through on the shared GET /:id.
const forBrandUsers = (middleware) => (req, res, next) =>
  BRAND_ROLES.includes(req.user.role) ? middleware(req, res, next) : next();

router.get('/', ...brandUser, requirePermission(PERMISSIONS.DELIVERY_VIEW), requireTenant, list);

router.get(
  '/:id',
  authenticate,
  requireRole(ROLES.CUSTOMER, ROLES.SUPER_ADMIN, ...BRAND_ROLES),
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
  '/:id',
  ...brandUser,
  requirePermission(PERMISSIONS.DELIVERY_MANAGE),
  requireTenant,
  update
);

module.exports = router;
