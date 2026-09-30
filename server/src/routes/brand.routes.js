const express = require('express');

const { list, getById, storefront, create, update, updateStatus } = require('../controllers/brand.controller');
const { getBrandByIdRaw } = require('../services/brand.service');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Public
router.get('/', list);
router.get('/:id', getById);
router.get('/:id/storefront', storefront);

// Super Admin only
router.post('/', authenticate, requireRole(ROLES.SUPER_ADMIN), create);
router.patch(
  '/:id/status',
  authenticate,
  requireRole(ROLES.SUPER_ADMIN),
  updateStatus
);

// Super Admin (any brand) or Brand Admin (own brand only) — the same
// route serves both; requireBrandOwnership bypasses the ownership
// comparison entirely for SUPER_ADMIN, and enforces it for BRAND_ADMIN
// (docs/05 §9 — "SUPER_ADMIN, BRAND_ADMIN -> own brand only").
router.patch(
  '/:id',
  authenticate,
  requireRole(ROLES.SUPER_ADMIN, ROLES.BRAND_ADMIN),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getBrandByIdRaw(req.params.id), {
    resourceType: 'tenant',
  }),
  update
);

module.exports = router;