const express = require('express');

const { list, getById, updateStatus, complete, cash } = require('../controllers/riderDelivery.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * The rider's own deliveries (docs/20 §4, docs/05 "Rider endpoints"). RIDER only;
 * the brand and the rider are taken from the signed-in account, and every query
 * is pinned to both, so a rider cannot reach another rider's or another brand's
 * delivery. Brand permissions do not apply here: a rider has none.
 */
router.use(authenticate, requireRole(ROLES.RIDER));

router.get('/', list);
router.get('/cash', cash); // before /:id
router.get('/:id', getById);
router.patch('/:id/status', updateStatus);
router.post('/:id/complete', complete);

module.exports = router;
