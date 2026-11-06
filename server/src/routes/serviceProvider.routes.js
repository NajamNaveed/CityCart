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

module.exports = router;
