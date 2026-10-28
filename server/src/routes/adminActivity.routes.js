const express = require('express');

const { list } = require('../controllers/adminActivity.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// The audit log is visible to the super admin only (docs/21 §G.2).
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/', list);

module.exports = router;
