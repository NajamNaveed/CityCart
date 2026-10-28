const express = require('express');

const { list, getById, getCurrentBrand, storefront, create, update, updateStatus } = require('../controllers/brand.controller');
const { apply, checkBrandName } = require('../controllers/brandOnboarding.controller');
const { authLimiter } = require('../middleware/rateLimiters');
const { getBrandByIdRaw } = require('../services/brand.service');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Public
router.get('/', list);
router.get('/check-name', checkBrandName); // must stay above '/:id'
router.get('/me', authenticate, requireRole(ROLES.BRAND_ADMIN), requireTenant, getCurrentBrand);
router.post('/apply', authLimiter, apply); // public seller sign-up (creates an account)
router.get('/:id', getById);
router.get('/:id/storefront', storefront);

// Platform-wide brand management: super admin, or a partner with admin.brands.
router.post('/', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.BRANDS), create);
router.patch(
  '/:id/status',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.BRANDS),
  updateStatus
);

// Super admin (any brand), a partner with admin.brands, or Brand Admin (own
// brand only) — the same route serves both; requireBrandOwnership bypasses
// platform admins and enforces the brand for BRAND_ADMIN (docs/05 §9).
router.patch(
  '/:id',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.BRANDS, { allowRoles: [ROLES.BRAND_ADMIN] }),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getBrandByIdRaw(req.params.id), {
    resourceType: 'tenant',
  }),
  update
);

module.exports = router;