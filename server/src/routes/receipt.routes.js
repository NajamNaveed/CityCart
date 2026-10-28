const express = require('express');

const { list, getById, getByOrder } = require('../controllers/receipt.controller');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const requireTenant = require('../middleware/requireTenant');
const { forBrandUsers, BRAND_ROLES } = require('../middleware/forBrandUsers');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

/**
 * Receipts (docs/10 §28, docs/20 §8). Read only: a receipt is issued by the
 * system when a payment is paid and is never created or edited through the API.
 *  - customers: their own receipts;
 *  - brand users: their brand's, with payments.view (the same permission as payments);
 *  - platform admins: all (a partner needs admin.payments — receipts are financial records).
 * Riders have no access.
 */
const readers = [
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.PAYMENTS, { allowRoles: [ROLES.CUSTOMER, ...BRAND_ROLES] }),
  forBrandUsers(requirePermission(PERMISSIONS.PAYMENTS_VIEW)),
  forBrandUsers(requireTenant),
];

router.get('/', ...readers, list);
router.get('/order/:orderId', ...readers, getByOrder);
router.get('/:id', ...readers, getById);

module.exports = router;
