const User = require('../models/user.model');
const { signToken, verifyToken } = require('../utils/jwt');
const { AUTH_COOKIE_NAME, staffAuthCookieOptions } = require('../config/cookie');
const { STAFF_ROLES } = require('../config/roles');
const { isAllowedWhenRestricted } = require('../config/restrictedAccess');

/**
 * Authentication middleware, per
 * docs/06-authentication-and-security.md §11 (Authentication Middleware):
 *
 *   Request -> Read authentication cookie -> Verify JWT ->
 *   Extract user identity -> Load/check user if required ->
 *   Attach authenticated user to request -> Continue
 *
 * This is authentication only ("who is this user?") — no role or
 * permission checks happen here, per this task's scope.
 */
async function authenticate(req, res, next) {
  try {
    const token = req.cookies && req.cookies[AUTH_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
    }

    // Loaded fresh from the database on every request (rather than
    // trusting the JWT payload alone) so a deactivated account cannot
    // keep using an already-issued token — the JWT itself has no
    // built-in revocation mechanism (§9, §12).
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
    }

    // Conceptual shape from §11 (req.user = { id, role, brandId }),
    // extended with the full user document so downstream handlers (e.g.
    // GET /auth/me) can read safe profile fields without a second query.
    // Terminated brand: access ends at accessExpiresAt (docs: grace period).
    if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= Date.now()) {
      return res.status(401).json({
        success: false,
        message: 'Your access has ended.',
        code: 'ACCESS_EXPIRED',
      });
    }

    // Until then the account is read-only (plus finishing deliveries).
    if (user.accessRestricted && !isAllowedWhenRestricted(req.method, req.originalUrl.split('?')[0])) {
      return res.status(403).json({
        success: false,
        message: 'Your brand has been terminated. Your account is read-only until your access ends.',
        code: 'ACCOUNT_RESTRICTED',
        accessExpiresAt: user.accessExpiresAt,
      });
    }

    req.user = user;

    // Sliding renewal (docs/06 §9 — staff session security): every
    // authenticated staff request re-issues the short-lived cookie, so an
    // active staff member never hits the expiry mid-work, while an idle or
    // stolen one still expires within hours. Shoppers keep their
    // full-length session untouched.
    if (STAFF_ROLES.includes(user.role)) {
      const renewed = signToken(
        { userId: user._id, role: user.role, brandId: user.brandId },
        { expiresIn: `${require('../config/env').staffSessionHours}h` },
      );
      res.cookie(AUTH_COOKIE_NAME, renewed, staffAuthCookieOptions);
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;