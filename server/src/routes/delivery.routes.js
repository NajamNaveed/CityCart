const express = require('express');

const { list, getById, updateStatus, update } = require('../controllers/delivery.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { ROLES } = require('../config/roles');
const { forBrandUsers, BRAND_ROLES } = require('../middleware/forBrandUsers');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

const brandUser = [authenticate, requireRole(...BRAND_ROLES)];

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
