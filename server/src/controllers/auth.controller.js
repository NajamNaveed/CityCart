const { registerSchema, loginSchema } = require('../validators/auth.validator');
const { registerUser, loginUser, toSafeUser, AuthError } = require('../services/auth.service');
const { AUTH_COOKIE_NAME, authCookieOptions, staffAuthCookieOptions } = require('../config/cookie');
const { ROLES, STAFF_ROLES } = require('../config/roles');
const Employee = require('../models/employee.model');
const { formatZodError } = require('../utils/formatZodError');

// Staff sessions use the short-lived cookie (docs/06 §9); shoppers the
// full-length one. The cookie options must match the token's expiry.
const cookieOptionsFor = (role) => (STAFF_ROLES.includes(role) ? staffAuthCookieOptions : authCookieOptions);

/**
 * Auth controllers for the endpoints in
 * docs/05-api-specification.md §6 (Authentication Endpoints):
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/logout
 *   GET  /api/v1/auth/me
 */

async function register(req, res, next) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const { user, token } = await registerUser(parsed.data);

    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

// One handler per login portal (customer / brand / admin). The portal decides
// which roles may sign in; see PORTAL_ROLES in services/auth.service.js.
const loginFor = (portal) =>
  async function login(req, res, next) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: formatZodError(parsed.error),
      });
    }

    try {
      const { user, token } = await loginUser(parsed.data, portal);

      res.cookie(AUTH_COOKIE_NAME, token, cookieOptionsFor(user.role));
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        user,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({ success: false, message: err.message });
      }
      return next(err);
    }
  };

const login = loginFor('customer');
const brandLogin = loginFor('brand');
const adminLogin = loginFor('admin');

function logout(req, res) {
  // §10: "The server must use the same cookie configuration required to
  // correctly remove the authentication cookie" — clearCookie needs the
  // same path/domain/sameSite/secure attributes used to set it (maxAge is
  // not needed for clearing).
  // maxAge is intentionally excluded — clearCookie only needs the
  // identifying options, not the expiry.
  // eslint-disable-next-line no-unused-vars
  const { maxAge, ...clearOptions } = authCookieOptions;
  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
  return res.status(200).json({ success: true, message: 'Logout successful' });
}

async function me(req, res, next) {
  // req.user is attached by the authenticate middleware; this route is
  // only reachable when that middleware has already confirmed the user
  // is authenticated and active.
  try {
    const user = toSafeUser(req.user);
    // A team member's permissions decide what the dashboard offers them.
    // (Brand owners and the super admin have full access and need no list.)
    if (req.user.role === ROLES.BRAND_EMPLOYEE) {
      const employee = await Employee.findOne({ userId: req.user._id });
      user.permissions = employee && employee.isActive ? employee.permissions : [];
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, brandLogin, adminLogin, logout, me };