const express = require('express');

const { list, getByProduct, update, adjust } = require('../controllers/inventory.controller');
const { getProductByIdRaw } = require('../services/product.service');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const validateProductIdParam = require('../middleware/validateProductIdParam');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Inventory is a brand-management resource: nothing here is public
// (docs/05 §13 — every endpoint requires inventory.view or inventory.manage).
//
// The ownership check runs against the PRODUCT the :productId refers to
// (docs/05 §13 — "Product belongs to user's brand"; docs/09 §17 —
// "brand ownership + product ownership"). Inventory records are then read
// and written using that verified product's brandId, so the brand used for
// stock changes never comes from the client. Reuses the existing
// requireBrandOwnership and product.service — no duplicate ownership logic.
const loadProduct = (req) => getProductByIdRaw(req.params.productId);

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  requireTenant,
  list
);

router.get(
  '/:productId',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  requireTenant,
  validateProductIdParam,
  requireBrandOwnership(loadProduct),
  getByProduct
);

router.patch(
  '/:productId',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  requireTenant,
  validateProductIdParam,
  requireBrandOwnership(loadProduct),
  update
);

router.post(
  '/:productId/adjust',
  authenticate,
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  requireTenant,
  validateProductIdParam,
  requireBrandOwnership(loadProduct),
  adjust
);

module.exports = router;