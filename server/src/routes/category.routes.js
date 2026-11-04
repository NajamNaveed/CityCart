const express = require('express');

const { list, tree, getById, create, update, remove } = require('../controllers/category.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Public (docs/05 §11 — "Public users may retrieve active categories")
router.get('/', list);
router.get('/tree', tree); // must stay above '/:id'
router.get('/:id', getById);

// Global categories are managed by the super admin, or a partner with
// admin.catalog. Brands only choose from the tree.
router.post('/', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.CATALOG), create);
router.patch(
  '/:id',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.CATALOG),
  validateObjectIdParam,
  update
);
// Deactivation, not destructive deletion (docs/04 §36; docs/05 §11).
router.delete(
  '/:id',
  authenticate,
  requireAdminPermission(ADMIN_PERMISSIONS.CATALOG),
  validateObjectIdParam,
  remove
);

module.exports = router;
