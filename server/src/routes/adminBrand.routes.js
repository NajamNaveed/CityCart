const express = require('express');

const { adminList, adminGet, adminTerminate } = require('../controllers/brandOnboarding.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Super admin only: full platform control over brands (docs/02 super admin).
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/', adminList);
router.get('/:id', adminGet);
router.post('/:id/terminate', adminTerminate);

module.exports = router;
