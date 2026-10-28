const express = require('express');

const { adminList, adminGet, adminTerminate } = require('../controllers/brandOnboarding.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Super admin, or a partner holding admin.brands (docs/21 §G.2).
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.BRANDS));

router.get('/', adminList);
router.get('/:id', adminGet);
router.post('/:id/terminate', adminTerminate);

module.exports = router;
