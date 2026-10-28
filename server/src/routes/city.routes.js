const express = require('express');

const { list, getById, create, update, remove } = require('../controllers/city.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Public
router.get('/', list);
router.get('/:id', getById);

// Super admin, or a partner with admin.locations.
router.post('/', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.LOCATIONS), create);
router.patch('/:id', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.LOCATIONS), update);
// Deactivation, not destructive deletion (docs/05 §8).
router.delete('/:id', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.LOCATIONS), remove);

module.exports = router;