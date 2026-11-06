const express = require('express');

const {
  register,
  login,
  brandLogin,
  staffLogin,
  deliveryLogin,
  adminLogin,
  workspaceLogin,
  switchWorkspaceHandler,
  logout,
  me,
  changePassword,
  verifyEmailToken,
  resendVerificationEmail,
  forgotPassword,
  resetPasswordHandler,
} = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../config/roles');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login); // customers only
router.post('/brand/login', authLimiter, brandLogin); // BRAND_ADMIN / BRAND_EMPLOYEE only
router.post('/staff/login', authLimiter, staffLogin); // BRAND_EMPLOYEE / PICKER, staff app only
router.post('/delivery/login', authLimiter, deliveryLogin); // RIDER, delivery app only
router.post('/admin/login', authLimiter, adminLogin); // SUPER_ADMIN / ADMIN_PARTNER only
// Second step for a multi-brand employee whose login answered 409
// WORKSPACE_REQUIRED (docs/05 §6, docs/24 §3.3).
router.post('/workspace', authLimiter, workspaceLogin);
router.post('/workspace/switch', authLimiter, authenticate, requireRole(ROLES.BRAND_EMPLOYEE), switchWorkspaceHandler);
// Email verification and password recovery. Rate-limited with the same
// strict limiter as the credential endpoints so links cannot be brute-forced
// or inboxes spammed.
router.post('/verify-email', authLimiter, verifyEmailToken);
router.post('/verify-email/resend', authLimiter, resendVerificationEmail);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordHandler);
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