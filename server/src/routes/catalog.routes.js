const express = require('express');

const { browseCatalog, browseOffers, listForBrand, listMine, getForBrand, request } = require('../controllers/catalog.controller');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Public: shoppers browse the catalogue inside their shopping area (docs/22 §C).
// These must stay above the '/:id' route below.
router.get('/browse', browseCatalog);
router.get('/browse/:id', validateObjectIdParam, browseOffers);

// What a store can pick from when it lists a product (brand staff only).
router.get('/', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), requireTenant, listForBrand);
// The store's own requests and private items. Must stay above '/:id'.
router.get('/mine', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), requireTenant, listMine);
router.post('/requests', authenticate, requirePermission(PERMISSIONS.PRODUCTS_CREATE), requireTenant, request);
router.get(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  requireTenant,
  validateObjectIdParam,
  getForBrand
);

module.exports = router;
