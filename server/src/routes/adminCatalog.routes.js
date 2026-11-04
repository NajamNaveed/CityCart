const express = require('express');

const {
  listForAdmin,
  create,
  update,
  approve,
  reject,
  merge,
  remove,
} = require('../controllers/catalog.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// The shared product catalogue, managed by the super admin or a partner with admin.catalog.
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.CATALOG));

router.get('/', listForAdmin);
router.post('/', create);
router.patch('/:id', validateObjectIdParam, update);
router.post('/:id/approve', validateObjectIdParam, approve);
router.post('/:id/reject', validateObjectIdParam, reject);
router.post('/:id/merge', validateObjectIdParam, merge);
router.delete('/:id', validateObjectIdParam, remove);

module.exports = router;
