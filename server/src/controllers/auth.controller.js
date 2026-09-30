const { registerSchema, loginSchema } = require('../validators/auth.validator');
const { registerUser, loginUser, toSafeUser, AuthError } = require('../services/auth.service');
const { AUTH_COOKIE_NAME, authCookieOptions } = require('../config/cookie');
const { formatZodError } = require('../utils/formatZodError');

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
    const { user, token } = await loginUser(parsed.data);

    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions);
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
}

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

function me(req, res) {
  // req.user is attached by the authenticate middleware; this route is
  // only reachable when that middleware has already confirmed the user
  // is authenticated and active.
  return res.status(200).json({ success: true, user: toSafeUser(req.user) });
}

module.exports = { register, login, logout, me };