const express = require('express');

const { list, tree, getById, create, update, remove } = require('../controllers/category.controller');
const { getCategoryByIdRaw } = require('../services/category.service');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const requireBrandOwnership = require('../middleware/requireBrandOwnership');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Public (docs/05 §11 — "Public users may retrieve active categories")
router.get('/', list);
router.get('/tree', tree); // must stay above '/:id'
router.get('/:id', getById);

// Create: no existing resource to fetch, so tenant ownership comes from
// requireTenant (req.tenantBrandId <- req.user.brandId) and the
// controller/service, never from the request body.
router.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.CATEGORIES_CREATE),
  requireTenant,
  create
);

router.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.CATEGORIES_UPDATE),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getCategoryByIdRaw(req.params.id)),
  update
);

// Deactivation, not destructive deletion (docs/04 §36; docs/05 §11).
router.delete(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.CATEGORIES_DELETE),
  requireTenant,
  validateObjectIdParam,
  requireBrandOwnership((req) => getCategoryByIdRaw(req.params.id)),
  remove
);

module.exports = router;