const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const Brand = require('../models/brand.model');
const AdminPartner = require('../models/adminPartner.model');
const ServiceProvider = require('../models/serviceProvider.model');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken, verifyToken } = require('../utils/jwt');
const { ROLES, STAFF_ROLES, STAFF_APP_ROLES, DELIVERY_APP_ROLES } = require('../config/roles');
const env = require('../config/env');
const { sendVerificationEmail } = require('./emailAuth.service');

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
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
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
 *
 * The account starts unverified: no session is issued until the emailed
 * link is opened (docs/06 §4). The email is best-effort — if the provider
 * is down, the user can ask for another link from the sign-in screen.
 */
async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email, accountType: 'CUSTOMER' });
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
      accountType: 'CUSTOMER',
      emailVerifiedAt: null,
    });
  } catch (err) {
    // Defense-in-depth against a race between the findOne check above and
    // this create() call — the compound unique index is the real
    // guarantee (Mongo duplicate-key error code 11000).
    if (err.code === 11000) {
      throw new AuthError(409, 'Email is already registered.');
    }
    throw err;
  }

  await sendVerificationEmail(user);
  return { user: toSafeUser(user) };
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
  staff: STAFF_APP_ROLES,
  delivery: DELIVERY_APP_ROLES,
  admin: [ROLES.SUPER_ADMIN, ROLES.ADMIN_PARTNER],
  // The seller portal's provider door (docs/24 §4.1). A provider session
  // never carries a brandId; it carries providerId instead.
  service: [ROLES.SERVICE_PROVIDER],
});

const PORTAL_ACCOUNT_TYPES = Object.freeze({
  customer: 'CUSTOMER',
  brand: 'BRAND',
  staff: 'BRAND',
  delivery: 'BRAND',
  admin: 'PLATFORM_ADMIN',
  service: 'SERVICE',
});

// A workspace token only chooses a membership; it is never a session
// (docs/06 §9, docs/24 §3.3).
const WORKSPACE_TOKEN_TTL = '5m';

/**
 * The person's active memberships, with the brand name the workspace picker
 * shows. Only called after the password has been proven, so the result can
 * never be used to discover accounts.
 */
async function activeMemberships(userId) {
  const memberships = await Employee.find({ userId, isActive: true });
  if (!memberships || memberships.length === 0) return [];
  const brands = await Brand.find({ _id: { $in: memberships.map((m) => m.brandId) } });
  const brandById = new Map((brands || []).map((b) => [String(b._id), b]));
  return memberships.map((membership) => ({
    membership,
    brand: brandById.get(String(membership.brandId)) || null,
  }));
}

function membershipRole(membership, user) {
  // Membership rows created before v3 have no stored role; they are plain
  // team members (docs/24 §3.2).
  return membership.role || (user && user.role) || ROLES.BRAND_EMPLOYEE;
}

function membershipSummary({ membership, brand }) {
  return {
    brandId: String(membership.brandId),
    brandName: brand ? brand.name : 'Brand',
    role: membershipRole(membership),
    membershipId: String(membership._id),
  };
}

/**
 * Issues a session token. An employee session names the membership (the
 * tenant and the role) rather than the account's home brand, per docs/24 §3.3.
 */
function issueSessionToken(user, { portal, membership, provider } = {}) {
  const role = membership ? membershipRole(membership, user) : user.role;
  const brandId = membership ? membership.brandId : user.brandId;
  return signToken(
    {
      userId: user._id,
      role,
      brandId,
      passwordVersion: user.passwordVersion,
      ...(provider && { providerId: provider._id }),
      ...(membership && { membershipId: membership._id }),
      // Marks an app token with the app it was issued to, so each app can
      // only ever use its own token (see middleware/authenticate.js).
      ...((portal === 'staff' || portal === 'delivery') && { client: portal }),
    },
    STAFF_ROLES.includes(role) ? { expiresIn: `${env.staffSessionHours}h` } : undefined,
  );
}

/**
 * Authenticates a user by email/password for one portal (see PORTAL_ROLES).
 *
 * A brand employee may belong to several brands (docs/24 §3.2-3.3): one
 * membership signs in directly, several answer 409 WORKSPACE_REQUIRED with a
 * short-lived token that only selects a workspace. Brand owners, pickers and
 * riders keep their single-brand session.
 */
async function loginUser({ email, password }, portal = 'customer') {
  const allowedRoles = PORTAL_ROLES[portal];
  if (!allowedRoles) {
    throw new Error(`Unknown login portal: ${portal}`);
  }
  // select('+passwordHash') is required: the User schema sets
  // passwordHash to select: false by default.
  const user = await User.findOne({ email, accountType: PORTAL_ACCOUNT_TYPES[portal] }).select('+passwordHash');

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

  // Unverified accounts are refused AFTER the password is proven, so the
  // check never reveals whether an address exists. The code lets the client
  // offer "resend verification email" instead of a dead end.
  if (user.emailVerifiedAt === null) {
    throw new AuthError(
      403,
      'Please verify your email before signing in. Check your inbox for the link.',
      'EMAIL_NOT_VERIFIED'
    );
  }

  // A deactivated partner record blocks the login even if the User row was
  // not flipped for some reason (the deactivate path flips both).
  if (user.role === ROLES.ADMIN_PARTNER) {
    const partner = await AdminPartner.findOne({ userId: user._id });
    if (!partner || !partner.isActive) {
      throw new AuthError(401, GENERIC_LOGIN_ERROR);
    }
  }

  // A provider whose tenant is suspended or terminated cannot sign in. A
  // PENDING provider may sign in: the dashboard shows the pending state and
  // lets them correct the application while the super admin reviews it.
  let provider = null;
  if (user.role === ROLES.SERVICE_PROVIDER) {
    provider = await ServiceProvider.findOne({ userId: user._id });
    if (!provider || !['PENDING', 'ACTIVE'].includes(provider.status)) {
      throw new AuthError(401, GENERIC_LOGIN_ERROR);
    }
  }

  let membership = null;
  if (user.role === ROLES.BRAND_EMPLOYEE) {
    const memberships = await activeMemberships(user._id);
    // No active membership means the person was removed from every brand.
    // The generic error keeps a removed account indistinguishable from a
    // wrong password.
    if (memberships.length === 0) {
      throw new AuthError(401, GENERIC_LOGIN_ERROR);
    }
    if (memberships.length > 1) {
      const workspaceToken = signToken(
        {
          userId: user._id,
          role: user.role,
          purpose: 'workspace',
          portal,
          passwordVersion: user.passwordVersion,
        },
        { expiresIn: WORKSPACE_TOKEN_TTL }
      );
      throw new AuthError(409, 'Choose a workspace.', 'WORKSPACE_REQUIRED', {
        workspaceToken,
        memberships: memberships.map(membershipSummary),
      });
    }
    membership = memberships[0].membership;
  }

  const token = issueSessionToken(user, { portal, membership, provider });
  return { user: toSafeUser(user, membership, provider), token };
}

/**
 * Exchanges a workspace token and a chosen brand for a normal session
 * (docs/05 §6, docs/06 §9). The membership is re-checked here, not trusted
 * from the token.
 */
async function completeWorkspaceLogin({ workspaceToken, brandId }) {
  let payload;
  try {
    payload = verifyToken(workspaceToken);
  } catch {
    throw new AuthError(401, 'This sign-in has expired. Please sign in again.', 'WORKSPACE_EXPIRED');
  }
  if (payload.purpose !== 'workspace') {
    throw new AuthError(401, 'This sign-in has expired. Please sign in again.', 'WORKSPACE_EXPIRED');
  }

  const user = await User.findById(payload.userId);
  if (!user || !user.isActive) {
    throw new AuthError(401, 'This sign-in has expired. Please sign in again.', 'WORKSPACE_EXPIRED');
  }
  if ((payload.passwordVersion || 0) !== (user.passwordVersion || 0)) {
    throw new AuthError(401, 'This sign-in has expired. Please sign in again.', 'WORKSPACE_EXPIRED');
  }
  if (user.role !== ROLES.BRAND_EMPLOYEE) {
    throw new AuthError(401, 'This sign-in has expired. Please sign in again.', 'WORKSPACE_EXPIRED');
  }

  const membership = await Employee.findOne({ userId: user._id, brandId, isActive: true });
  if (!membership) {
    throw new AuthError(403, 'You no longer have access to that workspace.', 'WORKSPACE_UNAVAILABLE');
  }

  const token = issueSessionToken(user, { portal: payload.portal, membership });
  return { user: toSafeUser(user, membership), token, portal: payload.portal, membership };
}

/**
 * Issues a fresh session for another active membership without asking for
 * the password again (docs/24 §3.3). Only employees with more than one
 * membership reach this; the target is always re-checked.
 */
async function switchWorkspace({ user, brandId, client }) {
  if (user.role !== ROLES.BRAND_EMPLOYEE) {
    throw new AuthError(403, 'Only team members can switch workspaces.', 'WORKSPACE_SWITCH_FORBIDDEN');
  }
  const membership = await Employee.findOne({ userId: user._id, brandId, isActive: true });
  if (!membership) {
    throw new AuthError(403, 'You no longer have access to that workspace.', 'WORKSPACE_UNAVAILABLE');
  }
  // Keep the app mark so a staff-app token stays usable in that app only.
  const token = issueSessionToken(user, { membership, portal: client });
  return { user: toSafeUser(user, membership), token, membership };
}

/**
 * Explicit allow-list of fields safe to return to the client, matching
 * the shape in docs/05-api-specification.md §6 (Login success example).
 * Deliberately not just spreading the Mongoose document — an allow-list
 * is defense-in-depth on top of the User schema's own toJSON transform.
 */
function toSafeUser(user, membership, provider) {
  // On an employee session the active membership (not the account's home
  // brand) decides the role and tenant the dashboard works in.
  const role = membership ? membershipRole(membership, user) : user.role;
  const brandId = membership ? membership.brandId : user.brandId;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role,
    // false only for a self-registered account that has not confirmed its
    // inbox yet (such accounts cannot sign in, but the flag keeps clients
    // honest if that rule ever loosens).
    emailVerified: user.emailVerifiedAt !== null && user.emailVerifiedAt !== undefined,
    // A brand account's own brand id (the dashboard needs it to load its categories).
    ...(brandId && { brandId }),
    // The Employee row backing an employee session (one per brand).
    ...(membership && { membershipId: membership._id }),
    // The provider tenant backing a SERVICE_PROVIDER session. The dashboard
    // uses the status to show "waiting for approval" before the first load.
    ...(provider && {
      providerId: provider._id,
      provider: {
        id: provider._id,
        displayName: provider.displayName,
        status: provider.status,
      },
    }),
    // Only present for staff of a terminated brand, so the UI can show a banner.
    ...(user.accessRestricted && {
      access: { restricted: true, expiresAt: user.accessExpiresAt },
    }),
    // A partner's first sign-in (or after a reset): the dashboard must send
    // them to choose a new password.
    ...(user.mustChangePassword && { mustChangePassword: true }),
  };
}

module.exports = {
  registerUser,
  loginUser,
  completeWorkspaceLogin,
  switchWorkspace,
  toSafeUser,
  AuthError,
  PORTAL_ROLES,
  PORTAL_ACCOUNT_TYPES,
};