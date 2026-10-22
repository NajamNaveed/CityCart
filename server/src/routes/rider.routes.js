const express = require('express');

const { list, create, update, resetPassword } = require('../controllers/rider.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { PERMISSIONS } = require('../config/permissions');
const { BRAND_ROLES } = require('../middleware/forBrandUsers');

const router = express.Router();

// Rider accounts are managed by the brand owner, or by a team member holding the
// permission. requireTenant pins everyone to their own brand. Riders themselves
// (and customers and the super admin) have no access here.
const brandUser = [authenticate, requireRole(...BRAND_ROLES)];

router.get('/', ...brandUser, requirePermission(PERMISSIONS.RIDERS_VIEW), requireTenant, list);
router.post('/', ...brandUser, requirePermission(PERMISSIONS.RIDERS_CREATE), requireTenant, create);
router.patch('/:id/password', ...brandUser, requirePermission(PERMISSIONS.RIDERS_UPDATE), requireTenant, resetPassword);
router.patch('/:id', ...brandUser, requirePermission(PERMISSIONS.RIDERS_UPDATE), requireTenant, update);

module.exports = router;
