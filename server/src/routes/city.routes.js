const express = require('express');

const { list, getById, create, update, remove } = require('../controllers/city.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Public
router.get('/', list);
router.get('/:id', getById);

// Super Admin only
router.post('/', authenticate, requireRole(ROLES.SUPER_ADMIN), create);
router.patch('/:id', authenticate, requireRole(ROLES.SUPER_ADMIN), update);
// Deactivation, not destructive deletion (docs/05 §8).
router.delete('/:id', authenticate, requireRole(ROLES.SUPER_ADMIN), remove);

module.exports = router;