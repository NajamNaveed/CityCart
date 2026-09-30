const express = require('express');

const { get, add, update, remove, clear } = require('../controllers/cart.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Customers only (docs/05 §14). Brand users and admins have no cart.
router.use(authenticate, requireRole(ROLES.CUSTOMER));

router.get('/', get);
router.post('/items', add);
router.patch('/items/:productId', update);
router.delete('/items/:productId', remove);
router.delete('/', clear);

module.exports = router;
