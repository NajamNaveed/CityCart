const express = require('express');

const { getSettings, patchSettings } = require('../controllers/adminSettings.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));
router.get('/settings', getSettings);
router.patch('/settings', patchSettings);

module.exports = router;