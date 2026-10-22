const User = require('../models/user.model');
const { signToken, verifyToken } = require('../utils/jwt');
const { AUTH_COOKIE_NAME, staffAuthCookieOptions } = require('../config/cookie');
const { ROLES, STAFF_ROLES, PARTNER_ROLES } = require('../config/roles');
const { readBearerToken } = require('../utils/clientType');
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
    // The session arrives as the HTTP-only cookie (web) or, for the native
    // app, as `Authorization: Bearer <token>`. A Bearer header with no usable
    // token is rejected outright, never quietly ignored; other schemes (Basic)
    // are not ours and are left alone.
    const bearer = readBearerToken(req);
    const viaBearer = bearer.present;
    const token = viaBearer ? bearer.token : req.cookies && req.cookies[AUTH_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: viaBearer ? 'Invalid or expired session.' : 'Authentication required.',
      });
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

    if ((payload.passwordVersion || 0) !== (user.passwordVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
    }

    // Bearer tokens belong to the native apps only (docs/06, docs/20 §6):
    //  - the shopper app's token (no `client` claim) works for CUSTOMER accounts;
    //  - the partner app's token (`client: 'partner'`, issued only by
    //    POST /auth/partner/login) works for the partner roles (riders and
    //    brand team members).
    // Brand owners and the super admin stay on the web dashboard, and a token
    // of one app never works as the other's, even for the same account.
    if (viaBearer) {
      const partnerToken = payload.client === 'partner';
      const allowed = user.role === ROLES.CUSTOMER ? !partnerToken : partnerToken && PARTNER_ROLES.includes(user.role);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Seller and admin accounts sign in on the web dashboard.',
          code: 'WEB_ONLY',
        });
      }
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
    // A partner-app (bearer) session has no cookie to renew: it simply lasts one
    // staff session length and the app signs in again.
    if (STAFF_ROLES.includes(user.role) && !req.skipStaffSessionRenewal && !viaBearer) {
      const renewed = signToken(
        {
          userId: user._id,
          role: user.role,
          brandId: user.brandId,
          passwordVersion: user.passwordVersion,
        },
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