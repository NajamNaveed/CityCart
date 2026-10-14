const express = require('express');

const { list } = require('../controllers/branch.controller');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// The caller's own brand's branches, read-only, for any staff member who can
// view products (the product form needs them to choose where a product is sold).
// Managing branches stays with the brand admin: see branch.routes.js.
router.get('/mine', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), requireTenant, list);

module.exports = router;
