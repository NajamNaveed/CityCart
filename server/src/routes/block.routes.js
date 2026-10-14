const express = require('express');

const { list, resolve, create, update, remove } = require('../controllers/block.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Public: block pickers and "where am I?" need no account.
router.get('/', list);
router.get('/resolve', resolve); // must stay above any '/:id' route

// Super Admin only (blocks are platform data, like cities).
router.post('/', authenticate, requireRole(ROLES.SUPER_ADMIN), create);
router.patch('/:id', authenticate, requireRole(ROLES.SUPER_ADMIN), update);
// Deactivation, not destructive deletion — branches reference blocks.
router.delete('/:id', authenticate, requireRole(ROLES.SUPER_ADMIN), remove);

module.exports = router;
