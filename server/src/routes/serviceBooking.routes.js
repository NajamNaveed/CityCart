const express = require('express');

const bookings = require('../controllers/serviceBooking.controller');
const reviews = require('../controllers/serviceReview.controller');
const chat = require('../controllers/serviceChat.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Customer bookings. Every handler scopes by req.user._id; the provider id is
// never read from the body, so a booking id cannot cross a customer boundary.
router.post('/bookings', authenticate, requireRole(ROLES.CUSTOMER), bookings.customerCreate);
router.get('/bookings', authenticate, requireRole(ROLES.CUSTOMER), bookings.customerList);
router.get('/bookings/:id', authenticate, requireRole(ROLES.CUSTOMER), bookings.customerGet);
router.post('/bookings/:id/proposals/accept', authenticate, requireRole(ROLES.CUSTOMER), bookings.acceptProposal);
router.post('/bookings/:id/proposals/decline', authenticate, requireRole(ROLES.CUSTOMER), bookings.declineProposal);
router.post('/bookings/:id/confirm', authenticate, requireRole(ROLES.CUSTOMER), bookings.confirm);
router.post('/bookings/:id/dispute', authenticate, requireRole(ROLES.CUSTOMER), bookings.dispute);
router.post('/bookings/:id/cancel', authenticate, requireRole(ROLES.CUSTOMER), bookings.cancel);

// A review belongs to one confirmed booking of the signed-in customer.
router.post('/bookings/:id/review', authenticate, requireRole(ROLES.CUSTOMER), reviews.create);
router.get('/bookings/:id/review', authenticate, requireRole(ROLES.CUSTOMER), reviews.bookingReview);

// Booking chat is shared by the customer and the provider. Membership is
// checked against the booking itself, so the same route serves both sides.
router.get('/chats', authenticate, requireRole(ROLES.CUSTOMER, ROLES.SERVICE_PROVIDER), chat.list);
router.get('/chats/unread', authenticate, requireRole(ROLES.CUSTOMER, ROLES.SERVICE_PROVIDER), chat.unread);
router.get('/chats/:id/messages', authenticate, requireRole(ROLES.CUSTOMER, ROLES.SERVICE_PROVIDER), chat.messages);
router.post('/chats/:id/messages', authenticate, requireRole(ROLES.CUSTOMER, ROLES.SERVICE_PROVIDER), chat.send);
router.post('/chats/:id/read', authenticate, requireRole(ROLES.CUSTOMER, ROLES.SERVICE_PROVIDER), chat.read);

module.exports = router;
