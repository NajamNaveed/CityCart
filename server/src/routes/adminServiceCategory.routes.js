const express = require('express');

const { list, create, update, remove } = require('../controllers/serviceCategory.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Service categories are part of the platform catalogue, so a partner holding
// admin.catalog may manage them exactly like product categories. Provider
// approval stays super-admin only (a different, tenant-specific decision).
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.CATALOG));

router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
