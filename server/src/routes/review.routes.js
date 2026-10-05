const express = require('express');

const { summary, create, mine, update, remove, brandList } = require('../controllers/review.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { PERMISSIONS } = require('../config/permissions');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Public: star ratings for a page of product cards.
router.get('/summary', summary);

// The brand dashboard: whoever may see products may read their reviews. Must stay above '/:id'.
router.get('/brand', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), requireTenant, brandList);

// Customers only: write, list, edit and delete their OWN reviews.
router.post('/', authenticate, requireRole(ROLES.CUSTOMER), create);
router.get('/mine', authenticate, requireRole(ROLES.CUSTOMER), mine);
router.patch('/:id', authenticate, requireRole(ROLES.CUSTOMER), validateObjectIdParam, update);
router.delete('/:id', authenticate, requireRole(ROLES.CUSTOMER), validateObjectIdParam, remove);

module.exports = router;