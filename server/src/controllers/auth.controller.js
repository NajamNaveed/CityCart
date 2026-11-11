const {
  registerSchema,
  loginSchema,
  emailRequestSchema,
  tokenSchema,
  resetPasswordSchema,
  workspaceTokenSchema,
  workspaceSwitchSchema,
} = require('../validators/auth.validator');
const {
  registerUser,
  loginUser,
  completeWorkspaceLogin,
  switchWorkspace,
  toSafeUser,
  AuthError,
} = require('../services/auth.service');
const {
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  EmailAuthError,
} = require('../services/emailAuth.service');
const { AUTH_COOKIE_NAME, authCookieOptions, staffAuthCookieOptions } = require('../config/cookie');
const { ROLES, STAFF_ROLES } = require('../config/roles');
const Employee = require('../models/employee.model');
const AdminPartner = require('../models/adminPartner.model');
const { formatZodError } = require('../utils/formatZodError');
const { changePasswordSchema } = require('../validators/password.validator');
const { changePassword: changePasswordForUser, PasswordError } = require('../services/password.service');
const { signToken } = require('../utils/jwt');
const { isMobileClient, isStaffClient, isDeliveryClient, isBusinessClient } = require('../utils/clientType');
const env = require('../config/env');

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
    // No session yet: the account becomes usable after the emailed link is
    // opened (docs/06 §4). The same answer is given to web and app clients.
    const { user } = await registerUser(parsed.data);
    return res.status(201).json({
      success: true,
      message: 'Check your email to verify your account.',
      user,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

// One handler per login portal (customer / brand / admin). The portal decides
// which roles may sign in; see PORTAL_ROLES in services/auth.service.js.
const loginFor = (portal) =>
  async function login(req, res, next) {
    // The business app has its own doors. A web door must never answer a
    // caller that says it is that app, or it would hand out a cookie session
    // an app has no way to use safely.
    if (isBusinessClient(req)) {
      return res.status(403).json({
        success: false,
        message: 'Business owners sign in through the CityCart Business app.',
        code: 'BUSINESS_APP_ONLY',
      });
    }

    // The app is for shoppers. Refused before credentials are even looked at,
    // so it cannot be used to probe seller or admin accounts.
    if (isMobileClient(req) && portal !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Seller and admin accounts sign in on the web dashboard.',
        code: 'WEB_ONLY',
      });
    }

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

      if (isMobileClient(req)) {
        return res.status(200).json({ success: true, message: 'Login successful', user, token });
      }
      res.cookie(AUTH_COOKIE_NAME, token, cookieOptionsFor(user.role));
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        user,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return res
          .status(err.status)
          .json({ success: false, message: err.message, ...(err.code && { code: err.code }), ...(err.extra || {}) });
      }
      return next(err);
    }
  };

// Sign-in for the native staff, delivery and business apps (docs/20,
// docs/23). Each app sends its own `X-Client` header; the token comes back in
// the body (no cookie), is marked with the app it belongs to, and lasts one
// staff session. Only that app's roles can use it; a wrong-role account gets
// the same generic error as a wrong password, so nobody can probe which
// accounts exist.
const BUSINESS_LOGIN = Object.freeze({
  check: isBusinessClient,
  code: 'BUSINESS_APP_ONLY',
  message: 'This sign-in is for the CityCart Business app.',
});

const APP_LOGIN = Object.freeze({
  staff: {
    check: isStaffClient,
    code: 'STAFF_APP_ONLY',
    message: 'This sign-in is for the CityCart Staff app.',
  },
  delivery: {
    check: isDeliveryClient,
    code: 'DELIVERY_APP_ONLY',
    message: 'This sign-in is for the CityCart Delivery app.',
  },
  businessBrand: BUSINESS_LOGIN,
  businessService: BUSINESS_LOGIN,
});

const appLoginFor = (portal) => {
  const app = APP_LOGIN[portal];
  return async function appLogin(req, res, next) {
    if (!app.check(req)) {
      return res.status(403).json({ success: false, message: app.message, code: app.code });
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(parsed.error) });
    }
    try {
      const { user, token } = await loginUser(parsed.data, portal);
      return res.status(200).json({ success: true, message: 'Login successful', user, token });
    } catch (err) {
      if (err instanceof AuthError) {
        return res
          .status(err.status)
          .json({ success: false, message: err.message, ...(err.code && { code: err.code }), ...(err.extra || {}) });
      }
      return next(err);
    }
  };
};

const staffLogin = appLoginFor('staff');
const deliveryLogin = appLoginFor('delivery');
// A brand owner and a provider owner share the one business app but keep
// separate doors, so each sign-in only ever looks up its own account type.
const businessBrandLogin = appLoginFor('businessBrand');
const businessServiceLogin = appLoginFor('businessService');

const login = loginFor('customer');
const brandLogin = loginFor('brand');
const adminLogin = loginFor('admin');
// Service providers use the same seller web portal, but their session
// carries the provider tenant instead of a brand (docs/24 §4.1).
const serviceLogin = loginFor('service');

/**
 * Second step of a multi-brand employee's sign-in (docs/24 §3.3): exchange
 * the short-lived workspace token and the chosen brand for a normal session.
 * The brand is only a choice; the service re-checks the active membership.
 * A staff-app token is returned in the body, the web brand portal gets the
 * same HTTP-only staff cookie as a normal login.
 */
async function workspaceLogin(req, res, next) {
  // Workspaces belong to team members on the web and in the staff app; the
  // business app has no multi-brand flow.
  if (isBusinessClient(req)) {
    return res.status(403).json({
      success: false,
      message: 'This sign-in is for the CityCart Business app.',
      code: 'BUSINESS_APP_ONLY',
    });
  }
  const parsed = workspaceTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(parsed.error) });
  }

  try {
    const { user, token, portal } = await completeWorkspaceLogin(parsed.data);
    if (portal === 'staff') {
      if (!isStaffClient(req)) {
        return res.status(403).json({ success: false, message: 'This sign-in is for the CityCart Staff app.', code: 'STAFF_APP_ONLY' });
      }
      return res.status(200).json({ success: true, message: 'Login successful', user, token });
    }
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptionsFor(user.role));
    return res.status(200).json({ success: true, message: 'Login successful', user });
  } catch (err) {
    if (err instanceof AuthError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }), ...(err.extra || {}) });
    }
    return next(err);
  }
}

/**
 * Switch to another active membership without re-entering the password
 * (docs/24 §3.3). The current session must be a staff session; the target
 * membership is re-checked right now.
 */
async function switchWorkspaceHandler(req, res, next) {
  const parsed = workspaceSwitchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(parsed.error) });
  }

  try {
    const { user, token } = await switchWorkspace({
      user: req.user,
      brandId: parsed.data.brandId,
      client: req.sessionClient,
    });
    if (req.sessionClient === 'staff') {
      return res.status(200).json({ success: true, message: 'Workspace switched', user, token });
    }
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptionsFor(user.role));
    return res.status(200).json({ success: true, message: 'Workspace switched', user });
  } catch (err) {
    if (err instanceof AuthError) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message, ...(err.code && { code: err.code }), ...(err.extra || {}) });
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

async function me(req, res, next) {
  // req.user is attached by the authenticate middleware; this route is
  // only reachable when that middleware has already confirmed the user
  // is authenticated and active.
  try {
    const user = toSafeUser(req.user, req.membership, req.provider);
    // A team member's permissions decide what the dashboard offers them.
    // The membership (not just the account) is the authority, so a person
    // employed by two brands sees the permissions of the active one.
    if (req.user.role === ROLES.BRAND_EMPLOYEE) {
      const employee =
        req.membership ||
        (await Employee.findOne({ userId: req.user._id, brandId: req.user.brandId, isActive: true }));
      user.permissions = employee && employee.isActive ? employee.permissions : [];
    }
    // A platform-admin partner's ticked areas and read-only mode (docs/21 §G).
    if (req.user.role === ROLES.ADMIN_PARTNER) {
      const partner = await AdminPartner.findOne({ userId: req.user._id });
      user.permissions = partner && partner.isActive ? partner.permissions : [];
      user.readOnly = Boolean(partner && partner.readOnly);
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    return next(err);
  }
}

async function changePassword(req, res, next) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const user = await changePasswordForUser(req.user._id, parsed.data);
    const token = signToken(
      {
        userId: user._id,
        role: req.user.role,
        brandId: req.user.brandId,
        passwordVersion: user.passwordVersion,
        ...(req.membership && { membershipId: req.membership._id }),
        ...(req.provider && { providerId: req.provider._id }),
        // Keep the app mark, so the replacement token stays usable in the
        // business app and nowhere else.
        ...(req.sessionClient === 'business' && { client: 'business' }),
      },
      { expiresIn: `${env.staffSessionHours}h` }
    );
    // An app session has no cookie: it replaces the now-stale bearer token
    // with the fresh one in the body.
    if (req.sessionClient === 'business') {
      return res.status(200).json({ success: true, message: 'Password changed successfully.', token });
    }
    res.cookie(AUTH_COOKIE_NAME, token, staffAuthCookieOptions);
    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    if (err instanceof PasswordError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function verifyEmailToken(req, res, next) {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    await verifyEmail(parsed.data.token);
    return res.status(200).json({
      success: true,
      message: 'Email verified. You can now sign in.',
    });
  } catch (err) {
    if (err instanceof EmailAuthError) {
      return res.status(err.status).json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

async function resendVerificationEmail(req, res, next) {
  const parsed = emailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const { message } = await resendVerification(parsed.data);
    return res.status(200).json({ success: true, message });
  } catch (err) {
    return next(err);
  }
}

async function forgotPassword(req, res, next) {
  const parsed = emailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    const { message } = await requestPasswordReset(parsed.data);
    return res.status(200).json({ success: true, message });
  } catch (err) {
    return next(err);
  }
}

async function resetPasswordHandler(req, res, next) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  try {
    await resetPassword(parsed.data);
    return res.status(200).json({
      success: true,
      message: 'Password changed. Sign in with your new password.',
    });
  } catch (err) {
    if (err instanceof EmailAuthError) {
      return res.status(err.status).json({ success: false, message: err.message, ...(err.code && { code: err.code }) });
    }
    return next(err);
  }
}

module.exports = {
  register,
  login,
  brandLogin,
  serviceLogin,
  staffLogin,
  deliveryLogin,
  businessBrandLogin,
  businessServiceLogin,
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
};