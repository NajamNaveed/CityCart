const express = require('express');

const { adminList } = require('../controllers/order.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Platform-wide order view: super admin, or a partner with admin.orders.
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.ORDERS));

router.get('/', adminList);

module.exports = router;