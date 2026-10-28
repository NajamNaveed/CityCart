const express = require('express');

const { list, resolve, create, update, remove } = require('../controllers/block.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Public: block pickers and "where am I?" need no account.
router.get('/', list);
router.get('/resolve', resolve); // must stay above any '/:id' route

// Super admin, or a partner with admin.locations (blocks are platform data,
// like cities).
router.post('/', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.LOCATIONS), create);
router.patch('/:id', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.LOCATIONS), update);
// Deactivation, not destructive deletion — branches reference blocks.
router.delete('/:id', authenticate, requireAdminPermission(ADMIN_PERMISSIONS.LOCATIONS), remove);

module.exports = router;
