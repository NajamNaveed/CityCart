const express = require('express');

const { list, getById, updateStatus } = require('../controllers/brandOrder.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Brand-scoped (docs/05 §17): brand admin/employee only. requireTenant
// resolves req.tenantBrandId from the user's OWN brand.
const brandUser = [authenticate, requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE)];

router.get('/', ...brandUser, requirePermission(PERMISSIONS.ORDERS_VIEW), requireTenant, list);
router.get('/:id', ...brandUser, requirePermission(PERMISSIONS.ORDERS_VIEW), requireTenant, getById);
router.patch(
  '/:id/status',
  ...brandUser,
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  requireTenant,
  updateStatus
);

module.exports = router;
