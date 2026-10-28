const express = require('express');

const { adminList, adminSetApproval } = require('../controllers/review.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Moderation: super admin, or a partner with admin.reviews.
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.REVIEWS));

router.get('/', adminList);
router.patch('/:id', validateObjectIdParam, adminSetApproval);

module.exports = router;