const env = require('./env');
const { parseDurationToMs } = require('../utils/parseDuration');

/**
 * Centralized authentication cookie configuration, per
 * docs/06-authentication-and-security.md §8 (HTTP-Only Cookies):
 * "The exact cookie configuration must be centralized rather than
 * duplicated throughout the codebase."
 *
 * Both the login controller (setting the cookie) and the logout
 * controller (clearing it) import AUTH_COOKIE_NAME and
 * authCookieOptions from here rather than redefining the values, per
 * §10 — "The server must use the same cookie configuration required to
 * correctly remove the authentication cookie."
 */

// One of the two example names in §8 ("admin_token / auth_token").
const AUTH_COOKIE_NAME = 'auth_token';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const authCookieOptions = {
  httpOnly: true,
  // §8: "During local development, secure may need to be disabled when
  // using plain HTTP." Only forced on in production.
  secure: env.nodeEnv === 'production',
  // 'lax' assumes the frontend and API are same-site in production (e.g.
  // subdomains of the same domain). If they end up on fully separate
  // domains, this would need to become 'none' (with secure: true) — the
  // docs only say "appropriate production setting" without specifics.
  sameSite: 'lax',
  maxAge: parseDurationToMs(env.jwtExpiresIn, SEVEN_DAYS_MS),
};

// Staff of the dashboards (brand admin/employees, platform admin) get a
// short-lived cookie (docs/06 §9 — staff session security): closing the tab
// ends their session, and a stolen cookie expires within hours instead of
// days. Renewed automatically on every authenticated staff request, so an
// active staff member is never logged out mid-work. Shoppers keep the
// full-length session above.
const staffAuthCookieOptions = {
  ...authCookieOptions,
  maxAge: env.staffSessionHours * 60 * 60 * 1000,
};

module.exports = { AUTH_COOKIE_NAME, authCookieOptions, staffAuthCookieOptions };