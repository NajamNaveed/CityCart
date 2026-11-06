const express = require('express');

const billing = require('../controllers/billing.controller');
const authenticate = require('../middleware/authenticate');
const requireSellerTenant = require('../middleware/requireSellerTenant');

const router = express.Router();

// Every handler reads the seller from the session (`req.seller`), never from
// the body or the query, so one seller can never reach another's bill.
router.use(authenticate, requireSellerTenant);

router.get('/account', billing.account);

router.get('/invoices', billing.invoices);
router.get('/invoices/:id', billing.invoice);
router.post('/invoices/:id/claims', billing.submitClaim);

router.get('/claims', billing.claims);
router.get('/claims/:id/receipt', billing.claimReceipt);
router.post('/receipt-signature', billing.uploadSignature);

router.get('/help', billing.helpList);
router.post('/help', billing.helpCreate);

module.exports = router;
