const express = require('express');

const { adminList, adminSetApproval } = require('../controllers/review.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Moderation: super admin only.
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/', adminList);
router.patch('/:id', validateObjectIdParam, adminSetApproval);

module.exports = router;