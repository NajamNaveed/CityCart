const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const ServiceProvider = require('../models/serviceProvider.model');
const { signToken, verifyToken } = require('../utils/jwt');
const { AUTH_COOKIE_NAME, staffAuthCookieOptions } = require('../config/cookie');
const { ROLES, STAFF_ROLES, STAFF_APP_ROLES, DELIVERY_APP_ROLES } = require('../config/roles');
const { readBearerToken } = require('../utils/clientType');
const { isAllowedWhenRestricted } = require('../config/restrictedAccess');

// The only endpoints a first-login partner (mustChangePassword) may reach.
const PASSWORD_CHANGE_ALLOWED = new Set([
  'GET /api/v1/auth/me',
  'PATCH /api/v1/auth/password',
  'POST /api/v1/auth/logout',
]);

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

    // A workspace token only chooses a membership; it is never a session
    // (docs/06 §9, docs/24 §3.3).
    if (payload.purpose === 'workspace') {
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

    // Bearer tokens belong to the native apps only (docs/06, docs/20 §6,
    // docs/23 §4):
    //  - the shopper app's token (no `client` claim) works for CUSTOMER accounts;
    //  - the staff app's token (`client: 'staff'`, issued only by
    //    POST /auth/staff/login) works for brand team members and pickers;
    //  - the delivery app's token (`client: 'delivery'`, issued only by
    //    POST /auth/delivery/login) works for riders.
    // Brand owners and the admins stay on the web dashboard, and a token of
    // one app never works as another app's, even for the same account.
    if (viaBearer) {
      const client = payload.client;
      const appRoles = client === 'staff' ? STAFF_APP_ROLES : client === 'delivery' ? DELIVERY_APP_ROLES : null;
      const allowed = client === undefined ? user.role === ROLES.CUSTOMER : Boolean(appRoles && appRoles.includes(user.role));
      if (!allowed) {
        const usesAnApp = user.role === ROLES.CUSTOMER || STAFF_APP_ROLES.includes(user.role) || DELIVERY_APP_ROLES.includes(user.role);
        return res.status(403).json({
          success: false,
          message: usesAnApp
            ? 'This account cannot use this app.'
            : 'Seller and admin accounts sign in on the web dashboard.',
          code: usesAnApp ? 'WRONG_APP' : 'WEB_ONLY',
        });
      }
    }

    // Resolve the active membership for a brand employee (docs/24 §3.3,
    // docs/06 §11): the tenant is the membership named by the session, never
    // the account's home brand. A token for a removed/inactive membership is
    // refused; it is never downgraded to the home brand. Brand owners,
    // pickers and riders keep their single-brand check.
    if (user.role === ROLES.BRAND_EMPLOYEE) {
      const activeBrandId = payload.brandId || user.brandId;
      if (!activeBrandId) {
        return res.status(401).json({ success: false, message: 'Invalid or expired session.', code: 'MEMBERSHIP_REQUIRED' });
      }
      const membership = await Employee.findOne({
        userId: user._id,
        brandId: activeBrandId,
        isActive: true,
        ...(payload.membershipId && { _id: payload.membershipId }),
      });
      // The query already filters on isActive; the explicit check is a
      // guard against a database row that changed between the read and here.
      if (!membership || !membership.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Your access to this workspace has ended.',
          code: 'MEMBERSHIP_INACTIVE',
        });
      }
      req.membership = membership;
      // Mutated in memory only: the rest of the chain sees the validated
      // active tenant.
      if (membership.brandId) user.brandId = membership.brandId;
    }

    // A provider's tenant is its ServiceProvider row, resolved from the
    // account on every request (never from the token or the body). A
    // suspended or terminated provider loses access immediately; PENDING is
    // allowed so the dashboard can show the application while it is reviewed.
    if (user.role === ROLES.SERVICE_PROVIDER) {
      const provider = await ServiceProvider.findOne({ userId: user._id });
      if (!provider || !['PENDING', 'ACTIVE'].includes(provider.status)) {
        return res.status(401).json({
          success: false,
          message: 'Your provider account is not active.',
          code: 'PROVIDER_INACTIVE',
        });
      }
      req.provider = provider;
      req.tenantProviderId = provider._id;
      req.tenantType = 'SERVICE';
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
    // Kept so /auth/workspace/switch can answer in the same form as the
    // session it was called with (bearer token vs cookie).
    req.sessionClient = payload.client;

    // A partner created (or reset) by the super admin must choose their own
    // password before the dashboard works (docs/21 §G.2). Only the three
    // auth endpoints below are reachable until then.
    if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${req.originalUrl.split('?')[0]}`)) {
      return res.status(403).json({
        success: false,
        message: 'Choose a new password before using the dashboard.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    // Sliding renewal (docs/06 §9 — staff session security): every
    // authenticated staff request re-issues the short-lived cookie, so an
    // active staff member never hits the expiry mid-work, while an idle or
    // stolen one still expires within hours. Shoppers keep their
    // full-length session untouched.
    // An app (bearer) session has no cookie to renew: it simply lasts one
    // staff session length and the app signs in again.
    if (STAFF_ROLES.includes(user.role) && !req.skipStaffSessionRenewal && !viaBearer) {
      const renewed = signToken(
        {
          userId: user._id,
          role: user.role,
          brandId: user.brandId,
          passwordVersion: user.passwordVersion,
          ...(req.membership && { membershipId: req.membership._id }),
          ...(req.provider && { providerId: req.provider._id }),
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