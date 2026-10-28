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
router.post('/admin/login', authLimiter, adminLogin); // SUPER_ADMIN / ADMIN_PARTNER only
router.post('/logout', logout);
router.get('/me', authenticate, me);
// Web staff only. A partner with a temporary password must use exactly this
// endpoint before anything else works (middleware/authenticate.js).
router.patch(
	'/password',
	authLimiter,
	(req, res, next) => {
		req.skipStaffSessionRenewal = true;
		next();
	},
	authenticate,
	requireRole(ROLES.BRAND_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN_PARTNER),
	changePassword
);

module.exports = router;