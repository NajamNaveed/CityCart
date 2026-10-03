const express = require('express');

const { register, login, brandLogin, adminLogin, logout, me } = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login); // customers only
router.post('/brand/login', authLimiter, brandLogin); // BRAND_ADMIN / BRAND_EMPLOYEE only
router.post('/admin/login', authLimiter, adminLogin); // SUPER_ADMIN only
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;