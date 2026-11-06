const express = require('express');

const reviews = require('../controllers/serviceReview.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Service-review moderation uses the same permission as product reviews.
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.REVIEWS));

router.get('/', reviews.adminList);
router.patch('/:id', reviews.adminSetApproval);

module.exports = router;
