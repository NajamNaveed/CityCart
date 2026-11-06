const express = require('express');

const billing = require('../controllers/adminBilling.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Seller billing is the platform's own money: docs/24 §5.6 gives it to the
// super admin only, not to delegated partners.
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get('/reports', billing.reports);

router.get('/settings', billing.getSettings);
router.patch('/settings', billing.patchSettings);

router.post('/invoices/generate', billing.generateInvoices);
router.get('/invoices', billing.invoices);
router.get('/invoices/:id', billing.invoice);

router.get('/claims', billing.claims);
router.get('/claims/:id/receipt', billing.claimReceipt);
router.post('/claims/:id/decision', billing.decideClaim);

router.get('/sellers', billing.sellers);
router.post('/sellers/:type/:id/override', billing.overrideFreeze);
router.post('/sellers/:type/:id/clear-freeze', billing.clearFreeze);
router.post('/sellers/:type/:id/grace', billing.grace);
router.delete('/sellers/:type/:id/grace', billing.revokeGrace);

router.get('/help', billing.helpList);
router.post('/help/:id/resolve', billing.resolveHelp);

module.exports = router;
