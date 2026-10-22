const express = require('express');

const { register, login, brandLogin, partnerLogin, adminLogin, logout, me, changePassword } = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login); // customers only
router.post('/brand/login', authLimiter, brandLogin); // BRAND_ADMIN / BRAND_EMPLOYEE only
router.post('/partner/login', authLimiter, partnerLogin); // RIDER / BRAND_EMPLOYEE, partner app only
router.post('/admin/login', authLimiter, adminLogin); // SUPER_ADMIN only
router.post('/logout', logout);
router.get('/me', authenticate, me);
router.patch(
	'/password',
	authLimiter,
	(req, res, next) => {
		req.skipStaffSessionRenewal = true;
		next();
	},
	authenticate,
	requireRole(ROLES.BRAND_ADMIN),
	changePassword
);

module.exports = router;