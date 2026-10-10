const express = require('express');

const { brandAnalytics, platformAnalytics } = require('../controllers/analytics.controller');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireRole = require('../middleware/requireRole');
const requireTenant = require('../middleware/requireTenant');
const { PERMISSIONS } = require('../config/permissions');
const { ROLES } = require('../config/roles');

const router = express.Router();
const brandAccess = [
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  requireTenant,
];

router.get('/brand/analytics', ...brandAccess, brandAnalytics);
router.get('/analytics/brand', ...brandAccess, brandAnalytics);
router.get('/admin/analytics', authenticate, requireRole(ROLES.SUPER_ADMIN), platformAnalytics);
router.get('/analytics/admin', authenticate, requireRole(ROLES.SUPER_ADMIN), platformAnalytics);

module.exports = router;