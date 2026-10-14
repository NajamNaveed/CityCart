const express = require('express');

const { list, create, update, remove } = require('../controllers/branch.controller');
const { getBranchByIdRaw } = require('../services/branch.service');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Branch management is the brand owner's job (like store settings and the
// inventory hub): BRAND_ADMIN only. Tenant comes from the session, and the
// :id routes verify the branch belongs to the caller's brand.
router.get('/', authenticate, requireRole(ROLES.BRAND_ADMIN), requireTenant, list);
router.post('/', authenticate, requireRole(ROLES.BRAND_ADMIN), requireTenant, create);

router.patch(
  '/:id',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getBranchByIdRaw(req.params.id)),
  update
);

router.delete(
  '/:id',
  authenticate,
  requireRole(ROLES.BRAND_ADMIN),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getBranchByIdRaw(req.params.id)),
  remove
);

module.exports = router;
