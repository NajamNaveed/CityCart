const express = require('express');

const { list, create, update, deactivate, resetPassword } = require('../controllers/adminPartner.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const validateObjectIdParam = require('../middleware/validateObjectIdParam');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Managing partners is the super admin's alone (docs/21 §G.2) — this is not
// delegatable, so no partner permission can open it.
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/', list);
router.post('/', create);
router.patch('/:id', validateObjectIdParam, update);
router.delete('/:id', validateObjectIdParam, deactivate);
router.patch('/:id/password', validateObjectIdParam, resetPassword);

module.exports = router;
