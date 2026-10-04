const express = require('express');

const { adminList } = require('../controllers/order.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Platform-wide view: super admin only. Single order detail already exists at
// GET /orders/:id, which lets the super admin read any order.
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/', adminList);

module.exports = router;