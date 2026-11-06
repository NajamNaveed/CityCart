const express = require('express');

const {
  apply,
  me,
  updateMe,
  changeBlock,
  categories,
} = require('../controllers/serviceProvider.controller');
const authenticate = require('../middleware/authenticate');
const requireServiceTenant = require('../middleware/requireServiceTenant');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// Public seller sign-up and the category choices it needs.
router.get('/categories', categories);
router.post('/apply', authLimiter, apply);

// The provider's own tenant. `requireServiceTenant` refuses every other
// role, so a brand session can never read or edit a provider profile.
router.get('/provider/me', authenticate, requireServiceTenant, me);
router.patch('/provider/me', authenticate, requireServiceTenant, updateMe);
router.patch('/provider/block', authenticate, requireServiceTenant, changeBlock);

module.exports = router;
