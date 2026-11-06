const express = require('express');

const { signature, providerSignature } = require('../controllers/upload.controller');
const authenticate = require('../middleware/authenticate');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const requireServiceTenant = require('../middleware/requireServiceTenant');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Whoever may add or edit products may upload their images.
router.post(
  '/signature',
  authenticate,
  requirePermission(PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_UPDATE),
  requireTenant,
  signature
);

// Service providers upload offering images into their own tenant folder.
router.post('/provider-signature', authenticate, requireServiceTenant, providerSignature);

module.exports = router;
