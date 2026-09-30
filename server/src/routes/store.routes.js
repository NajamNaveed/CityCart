const express = require('express');

const { getById, me, update } = require('../controllers/store.controller');
const { getStoreByIdRaw } = require('../services/store.service');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Must be registered before '/:id', or Express would try to match "me"
// as an :id value.
router.get(
  '/me',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE),
  requireTenant,
  me
);

// Public
router.get('/:id', getById);

// store.update + correct brand ownership (docs/05 §10). requirePermission
// already grants SUPER_ADMIN/BRAND_ADMIN full access and requires an
// explicit permission for BRAND_EMPLOYEE; requireBrandOwnership then
// verifies the specific store belongs to the caller's brand (or bypasses
// for SUPER_ADMIN).
router.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.STORE_UPDATE),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getStoreByIdRaw(req.params.id)),
  update
);

module.exports = router;