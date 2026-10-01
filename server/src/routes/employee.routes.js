const express = require('express');

const { list, getById, create, update, remove, updatePermissions } = require('../controllers/employee.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const requireTenant = require('../middleware/requireTenant');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Brand admin, brand employees holding the permission, or super admin.
// requireTenant pins brand users to their own brand.
const staff = [authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE)];

router.get('/', ...staff, requirePermission(PERMISSIONS.EMPLOYEES_VIEW), requireTenant, list);
router.post('/', ...staff, requirePermission(PERMISSIONS.EMPLOYEES_CREATE), requireTenant, create);
router.get('/:id', ...staff, requirePermission(PERMISSIONS.EMPLOYEES_VIEW), requireTenant, getById);
router.patch('/:id/permissions', ...staff, requirePermission(PERMISSIONS.EMPLOYEES_MANAGE_PERMISSIONS), requireTenant, updatePermissions);
router.patch('/:id', ...staff, requirePermission(PERMISSIONS.EMPLOYEES_UPDATE), requireTenant, update);
router.delete('/:id', ...staff, requirePermission(PERMISSIONS.EMPLOYEES_DELETE), requireTenant, remove);

module.exports = router;
