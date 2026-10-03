const User = require('../models/user.model');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { ROLES } = require('../config/roles');

/**
 * Auth business logic, per docs/06-authentication-and-security.md §4
 * (Registration) and §6 (Login).
 *
 * Thrown errors carry a `status` (HTTP status code) so the controller can
 * translate them directly into a response without re-deriving intent.
 * Messages are written to be safe to return to the client as-is (see
 * §29 — consistent { success: false, message } error shape).
 */

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Same generic message for every login failure cause (unknown email,
// wrong password, inactive account). Per §6 — "Invalid login attempts
// should return a generic authentication error rather than revealing
// whether an email exists" — and since the documented login flow checks
// account status before comparing the password, using a distinct message
// for "inactive" would itself leak that the email exists. The specific
// cause is available to the caller via the error, for server-side
// logging only (§29 — detailed errors are logged server-side, not
// returned to clients).
const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

/**
 * Registers a new CUSTOMER. Public registration can never create any
 * other role (§4) — the role is hardcoded here, never taken from input.
 */
async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AuthError(409, 'Email is already registered.');
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await User.create({
      name,
      email,
      passwordHash,
      role: 'CUSTOMER',
    });
  } catch (err) {
    // Defense-in-depth against a race between the findOne check above and
    // this create() call — the unique index on email is the real
    // guarantee (Mongo duplicate-key error code 11000).
    if (err.code === 11000) {
      throw new AuthError(409, 'Email is already registered.');
    }
    throw err;
  }

  const token = signToken({ userId: user._id, role: user.role, brandId: user.brandId });

  return { user: toSafeUser(user), token };
}

/**
 * Login portals. Each portal accepts ONLY its own roles, so a brand account
 * can never sign in through the customer form (and vice versa), and the
 * super admin has a separate entry point. The role check happens on the
 * server; a wrong-portal attempt gets the same generic error as a wrong
 * password, so nobody can probe which accounts exist or what role they hold.
 */
const PORTAL_ROLES = Object.freeze({
  customer: [ROLES.CUSTOMER],
  brand: [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE],
  admin: [ROLES.SUPER_ADMIN],
});

/**
 * Authenticates a user by email/password for one portal (see PORTAL_ROLES).
 */
async function loginUser({ email, password }, portal = 'customer') {
  const allowedRoles = PORTAL_ROLES[portal];
  if (!allowedRoles) {
    throw new Error(`Unknown login portal: ${portal}`);
  }
  // select('+passwordHash') is required: the User schema sets
  // passwordHash to select: false by default.
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user) {
    throw new AuthError(401, GENERIC_LOGIN_ERROR);
  }

  if (!user.isActive) {
    // §12: "Inactive users must not be allowed to authenticate
    // successfully." Checked before the password comparison, matching
    // the documented login flow order.
    throw new AuthError(401, GENERIC_LOGIN_ERROR);
  }

  // Staff of a terminated brand can log in only until their access ends.
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= Date.now()) {
    throw new AuthError(401, GENERIC_LOGIN_ERROR);
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AuthError(401, GENERIC_LOGIN_ERROR);
  }

  // Right credentials, wrong door: same generic error (see PORTAL_ROLES).
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(401, GENERIC_LOGIN_ERROR);
  }

  const token = signToken({ userId: user._id, role: user.role, brandId: user.brandId });

  return { user: toSafeUser(user), token };
}

/**
 * Explicit allow-list of fields safe to return to the client, matching
 * the shape in docs/05-api-specification.md §6 (Login success example).
 * Deliberately not just spreading the Mongoose document — an allow-list
 * is defense-in-depth on top of the User schema's own toJSON transform.
 */
function toSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    // A brand account's own brand id (the dashboard needs it to load its categories).
    ...(user.brandId && { brandId: user.brandId }),
    // Only present for staff of a terminated brand, so the UI can show a banner.
    ...(user.accessRestricted && {
      access: { restricted: true, expiresAt: user.accessExpiresAt },
    }),
  };
}

module.exports = { registerUser, loginUser, toSafeUser, AuthError, PORTAL_ROLES };