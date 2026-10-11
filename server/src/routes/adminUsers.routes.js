const express = require('express');

const { list } = require('../controllers/adminUsers.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));
router.get('/users', list);

module.exports = router;