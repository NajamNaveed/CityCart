const express = require('express');

const { queue, getById, claim, pickLine, propose, pack, products } = require('../controllers/picker.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const requireTenant = require('../middleware/requireTenant');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Pickers only. The brand comes from the picker's own account (requireTenant),
// never from the request, so another brand's order is simply not found.
const picker = [authenticate, requireRole(ROLES.PICKER), requireTenant];

// A picker has no brand-team permissions: these are the only endpoints the
// role can reach, and each answers with names and quantities but no money.
router.get('/', ...picker, queue);
router.get('/products', ...picker, products);
router.get('/:id', ...picker, getById);
router.post('/:id/claim', ...picker, claim);
router.patch('/:id/items/:itemId', ...picker, pickLine);
router.post('/:id/propose', ...picker, propose);
router.post('/:id/pack', ...picker, pack);

module.exports = router;
