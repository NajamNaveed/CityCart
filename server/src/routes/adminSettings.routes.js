const express = require('express');

const { getSettings, patchSettings } = require('../controllers/adminSettings.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Scoped per route: this router is mounted at /api/v1/admin, so a router-level
// guard would also run for /admin/users, /admin/partners, and so on.
const requireSettings = requireAdminPermission(ADMIN_PERMISSIONS.SETTINGS);

router.get('/settings', authenticate, requireSettings, getSettings);
router.patch('/settings', authenticate, requireSettings, patchSettings);

module.exports = router;