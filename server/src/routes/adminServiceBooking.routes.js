const express = require('express');

const bookings = require('../controllers/serviceBooking.controller');
const chat = require('../controllers/serviceChat.controller');
const authenticate = require('../middleware/authenticate');
const requireAdminPermission = require('../middleware/requireAdminPermission');
const { ADMIN_PERMISSIONS } = require('../config/adminPermissions');

const router = express.Router();

// Booking oversight and disputes: the same permission that guards orders.
router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.ORDERS));

router.get('/', bookings.adminList);
router.get('/:id', bookings.adminGet);
router.get('/:id/messages', chat.adminMessages);
router.patch('/:id/dispute', bookings.adminResolveDispute);

module.exports = router;
