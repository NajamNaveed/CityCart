const express = require('express');

const { brandAnalytics, platformAnalytics, aiUsage } = require('../controllers/analytics.controller');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const requireTenant = require('../middleware/requireTenant');
const { PERMISSIONS } = require('../config/permissions');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();
const brandAccess = [
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  requireTenant,
];

router.get('/brand/analytics', ...brandAccess, brandAnalytics);
router.get('/analytics/brand', ...brandAccess, brandAnalytics);
router.get('/admin/analytics', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.ANALYTICS), platformAnalytics);
router.get('/analytics/admin', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.ANALYTICS), platformAnalytics);
// AI spend and fallback review (docs/29 Phase 7b). Read-only, so read-only
// partners holding admin.analytics can see it; it never calls a provider.
router.get('/admin/ai-usage', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.ANALYTICS), aiUsage);

module.exports = router;