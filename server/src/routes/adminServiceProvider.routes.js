const express = require('express');

const {
  adminList,
  adminGet,
  adminUpdateStatus,
} = require('../controllers/serviceProvider.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// docs/02 §19: approving, suspending, terminating and reinstating a provider
// is a super-admin action. A delegated partner handles brands, not providers.
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/', adminList);
router.get('/:id', adminGet);
router.patch('/:id/status', adminUpdateStatus);

module.exports = router;
