const express = require('express');

const { list, getById, create, update, remove } = require('../controllers/product.controller');
const { getProductByIdRaw } = require('../services/product.service');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Public (docs/05 §12 — public users receive active products only)
router.get('/', list);
router.get('/:id', getById);

// Create: no existing resource to fetch, so tenant ownership comes from
// requireTenant (req.tenantBrandId <- req.user.brandId) and the
// controller/service, never from the request body.
router.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_CREATE),
  requireTenant,
  create
);

router.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getProductByIdRaw(req.params.id)),
  update
);

// Archival, not destructive deletion (docs/04 §36; docs/05 §12).
router.delete(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_DELETE),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getProductByIdRaw(req.params.id)),
  remove
);

module.exports = router;