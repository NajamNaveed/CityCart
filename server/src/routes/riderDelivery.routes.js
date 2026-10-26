const express = require('express');

const { list, getById, updateStatus, complete, cash, shareLocation, stopSharing } = require('../controllers/riderDelivery.controller');
const { riderLocationLimiter } = require('../middleware/rateLimiters');
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
// Sharing the rider's position while delivering (docs/11 §30). Only the rider's own, one point.
router.put('/location', riderLocationLimiter, shareLocation);
router.delete('/location', stopSharing);
router.get('/:id', getById);
router.patch('/:id/status', updateStatus);
router.post('/:id/complete', complete);

module.exports = router;
