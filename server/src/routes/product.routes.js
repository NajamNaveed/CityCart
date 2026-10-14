const express = require('express');

const { list, mine, mineById, getById, create, update, remove } = require('../controllers/product.controller');
const { exportCsv, importCsv } = require('../controllers/productCsv.controller');
const { forProduct: reviewsForProduct } = require('../controllers/review.controller');
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
// The caller's own products, every status. Must stay above '/:id'.
// A super admin has no brand (tenantBrandId is null), so the route is brand-staff only.
router.get(
  '/mine',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  requireTenant,
  mine
);
// CSV export of the brand's products. Must stay above '/mine/:id'.
router.get(
  '/mine/export',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  requireTenant,
  exportCsv
);
router.get(
  '/mine/:id',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getProductByIdRaw(req.params.id)),
  mineById
);
// A product's public reviews and rating summary.
router.get('/:id/reviews', validateObjectIdParam, reviewsForProduct);
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

// CSV import creates new products and updates existing ones (matched by SKU,
// else name), so it needs both permissions. Only text/csv bodies are parsed.
router.post(
  '/import',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_CREATE),
  requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
  requireTenant,
  express.text({ type: 'text/csv', limit: '1mb' }),
  importCsv
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