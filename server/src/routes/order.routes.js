const express = require('express');

const { create, my, getById, cancel } = require('../controllers/order.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Checkout and "my orders" are customer-only (docs/05 §15-16).
router.post('/', authenticate, requireRole(ROLES.CUSTOMER), create);
router.get('/my', authenticate, requireRole(ROLES.CUSTOMER), my); // above '/:id'
router.patch('/:id/cancel', authenticate, requireRole(ROLES.CUSTOMER), cancel);

// Customer (own order) or SUPER_ADMIN. Brand access is on /brand/orders.
router.get('/:id', authenticate, requireRole(ROLES.CUSTOMER, ROLES.SUPER_ADMIN), getById);

module.exports = router;
