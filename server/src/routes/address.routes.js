const express = require('express');

const { list, create, update, makeDefault, remove } = require('../controllers/address.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// A customer's saved delivery addresses. Customers only; always scoped to the caller.
router.use(authenticate, requireRole(ROLES.CUSTOMER));

router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.post('/:id/default', makeDefault);
router.delete('/:id', remove);

module.exports = router;
