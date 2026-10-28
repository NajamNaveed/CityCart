const express = require('express');

const { list } = require('../controllers/adminUsers.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Scoped per route: mounted at /api/v1/admin, so router-level middleware
// would also run for the partner and activity routers.
router.get('/users', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.USERS), list);

module.exports = router;