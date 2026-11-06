const express = require('express');

const {
  apply,
  me,
  updateMe,
  changeBlock,
  categories,
} = require('../controllers/serviceProvider.controller');
const { discover, publicProvider } = require('../controllers/serviceDiscovery.controller');
const offerings = require('../controllers/serviceOffering.controller');
const availability = require('../controllers/serviceAvailability.controller');
const bookings = require('../controllers/serviceBooking.controller');
const reviews = require('../controllers/serviceReview.controller');
const authenticate = require('../middleware/authenticate');
const requireServiceTenant = require('../middleware/requireServiceTenant');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Public: catalog choices, discovery and the provider's published page.
router.get('/categories', categories);
router.get('/discover', discover);
router.get('/providers/:slug', publicProvider);
router.post('/apply', authLimiter, apply);

// The provider's own tenant. `requireServiceTenant` refuses every other
// role, so a brand session can never read or edit a provider profile.
router.get('/provider/me', authenticate, requireServiceTenant, me);
router.patch('/provider/me', authenticate, requireServiceTenant, updateMe);
router.patch('/provider/block', authenticate, requireServiceTenant, changeBlock);

// The provider's own offerings. Every query is scoped to the session tenant.
router.get('/provider/offerings', authenticate, requireServiceTenant, offerings.list);
router.post('/provider/offerings', authenticate, requireServiceTenant, offerings.create);
router.patch('/provider/offerings/:id', authenticate, requireServiceTenant, offerings.update);
router.delete('/provider/offerings/:id', authenticate, requireServiceTenant, offerings.remove);

// Weekly working hours and blackout days (Karachi wall clock).
router.get('/provider/availability', authenticate, requireServiceTenant, availability.mine);
router.put('/provider/availability', authenticate, requireServiceTenant, availability.replaceMine);

// Booking inbox and lifecycle. Each handler scopes to req.tenantProviderId.
router.get('/provider/bookings', authenticate, requireServiceTenant, bookings.providerList);
router.get('/provider/bookings/:id', authenticate, requireServiceTenant, bookings.providerGet);
router.post('/provider/bookings/:id/accept', authenticate, requireServiceTenant, bookings.providerAcceptBooking);
router.post('/provider/bookings/:id/propose', authenticate, requireServiceTenant, bookings.providerProposeBooking);
router.post('/provider/bookings/:id/start', authenticate, requireServiceTenant, bookings.providerStartBooking);
router.post('/provider/bookings/:id/complete', authenticate, requireServiceTenant, bookings.providerCompleteBooking);
router.post('/provider/bookings/:id/cancel', authenticate, requireServiceTenant, bookings.cancel);

// Reviews of this provider, and a single reply per review.
router.get('/provider/reviews', authenticate, requireServiceTenant, reviews.providerList);
router.post('/provider/reviews/:id/reply', authenticate, requireServiceTenant, reviews.reply);

module.exports = router;
