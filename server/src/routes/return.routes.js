const express = require('express');

const { list, summary, getById, photo, receive } = require('../controllers/return.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const requireTenant = require('../middleware/requireTenant');
const { forBrandUsers, BRAND_ROLES } = require('../middleware/forBrandUsers');
const { PERMISSIONS } = require('../config/permissions');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// The returned-goods inbox (docs/22 §F): a brand sees its own returns; a
// platform admin with admin.orders sees every brand for the admin screen.
const read = [
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.ORDERS, { allowRoles: [...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.DELIVERY_VIEW)),
  forBrandUsers(requireTenant),
];

router.get('/', ...read, list);
router.get('/summary', ...read, summary); // before /:id
router.get('/:id/photo', ...read, photo);
router.get('/:id', ...read, getById);

// Receiving changes stock, so platform admins cannot do it from here: this is
// the brand's decision, and only a brand user with delivery.manage may make it.
router.post(
  '/:id/receive',
  authenticate,
  requireRole(...BRAND_ROLES),
  requirePermission(PERMISSIONS.DELIVERY_MANAGE),
  requireTenant,
  receive
);

module.exports = router;
