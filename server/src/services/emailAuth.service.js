const User = require('../models/user.model');
const Brand = require('../models/brand.model');
const ServiceProvider = require('../models/serviceProvider.model');
const { issueToken, consumeToken } = require('./accountToken.service');
const { sendEmail } = require('./email.service');
const { replacePasswordHash } = require('./password.service');
const {
  notifySuperAdminsOfNewBrand,
  notifyBrandOwnerWelcome,
  notifySuperAdminsOfNewProvider,
} = require('./notification.service');
const { ROLES } = require('../config/roles');
const env = require('../config/env');

/**
 * Email verification and password reset (docs/06 §4–§8).
 *
 * Tokens are single-use, hashed at rest, and expire (24 h to verify, 60 min
 * to reset by default). Responses to "resend" and "forgot password" are
 * deliberately identical whether or not the address exists, so the endpoints
 * cannot be used to discover which emails have accounts.
 */
class EmailAuthError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const PORTAL_ACCOUNT_TYPES = Object.freeze({ customer: 'CUSTOMER', brand: 'BRAND', service: 'SERVICE' });

const VERIFY_TTL_MS = env.email.verifyTtlHours * 60 * 60 * 1000;
const RESET_TTL_MS = env.email.resetTtlMinutes * 60 * 1000;

const RESET_GENERIC_MESSAGE =
  'If that email belongs to an account, a reset link is on its way. Check your inbox (and spam folder).';
const RESEND_GENERIC_MESSAGE =
  'If that email belongs to an unverified account, a new verification link is on its way.';
const INVALID_LINK_MESSAGE = 'This link is invalid or has expired. Request a new one.';

const portalForUser = (user) => {
  if (user.accountType === 'SERVICE') return 'service';
  return user.accountType === 'BRAND' ? 'brand' : 'customer';
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function accountTypeForPortal(portal) {
  return PORTAL_ACCOUNT_TYPES[portal] || PORTAL_ACCOUNT_TYPES.customer;
}

function emailShell({ heading, body, link, linkLabel, footer }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:Segoe UI,Arial,sans-serif;color:#1c1917">
  <div style="max-width:520px;margin:32px auto;padding:32px;background:#ffffff;border-radius:12px">
    <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 16px;line-height:1.6">${body}</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#ffffff;border-radius:8px;text-decoration:none">${escapeHtml(linkLabel)}</a></p>
    <p style="margin:0;font-size:13px;color:#57534e;line-height:1.6">${footer}</p>
  </div>
</body></html>`;
}

async function deliverVerificationEmail(user) {
  const { token } = await issueToken({ userId: user._id, type: 'EMAIL_VERIFY', ttlMs: VERIFY_TTL_MS });
  const portal = portalForUser(user);
  const link = `${env.clientUrl}/verify-email?token=${encodeURIComponent(token)}&portal=${portal}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your CityCart email',
    html: emailShell({
      heading: `Welcome to CityCart, ${user.name}`,
      body: 'Confirm your email address to activate your account. This link works once.',
      link,
      linkLabel: 'Verify my email',
      footer: `The link expires in ${env.email.verifyTtlHours} hours. If you did not create a CityCart account, you can ignore this email.`,
    }),
    text: `Hi ${user.name},\n\nVerify your CityCart email by opening this link:\n${link}\n\nThe link expires in ${env.email.verifyTtlHours} hours. If you did not create an account, ignore this email.`,
  });
}

async function deliverPasswordResetEmail(user) {
  const { token } = await issueToken({ userId: user._id, type: 'PASSWORD_RESET', ttlMs: RESET_TTL_MS });
  const portal = portalForUser(user);
  const link = `${env.clientUrl}/reset-password?token=${encodeURIComponent(token)}&portal=${portal}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your CityCart password',
    html: emailShell({
      heading: 'Reset your password',
      body: `We received a request to reset the password for your CityCart account (${escapeHtml(user.email)}). This link works once.`,
      link,
      linkLabel: 'Choose a new password',
      footer: `The link expires in ${env.email.resetTtlMinutes} minutes. If you did not ask for a reset, do not open it — your password has not changed.`,
    }),
    text: `We received a request to reset the password for your CityCart account (${user.email}).\n\nOpen this link to choose a new password:\n${link}\n\nThe link expires in ${env.email.resetTtlMinutes} minutes. If you did not ask for this, ignore the email — your password has not changed.`,
  });
}

// Email delivery is best-effort: an account or brand that was created must
// not be rolled back because the provider was briefly unavailable. The user
// can request another link from the sign-in screen.
async function sendVerificationEmail(user) {
  try {
    await deliverVerificationEmail(user);
    return true;
  } catch (err) {
    console.error(`[email] Could not send verification email to user ${user._id}: ${err.message}`);
    return false;
  }
}

/**
 * A provider stays PENDING even after the inbox is proven: only the super
 * admin approves it (docs/24 §4.1). Proving the inbox is when the platform
 * learns the application is real, so the super admin is notified here.
 */
async function announceVerifiedProvider(user) {
  if (user.role !== ROLES.SERVICE_PROVIDER) return;
  const provider = await ServiceProvider.findOne({ userId: user._id });
  if (!provider) return;
  await notifySuperAdminsOfNewProvider({
    providerId: provider._id,
    providerName: provider.displayName,
    ownerName: user.name,
  });
}

/**
 * A brand stays PENDING (invisible in discovery) until its owner proves the
 * inbox. Activation is limited to PENDING, so it can never override a
 * suspension or termination an admin set in the meantime.
 */
async function activatePendingBrand(user) {
  if (user.role !== ROLES.BRAND_ADMIN || !user.brandId) return;
  const brand = await Brand.findOneAndUpdate(
    { _id: user.brandId, status: 'PENDING' },
    { $set: { status: 'ACTIVE' } },
    { new: true }
  );
  if (!brand) return;
  await notifySuperAdminsOfNewBrand({
    brandId: brand._id,
    brandName: brand.name,
    ownerName: user.name,
  });
  await notifyBrandOwnerWelcome({ userId: user._id, brandName: brand.name });
}

async function verifyEmail(token) {
  const claimed = await consumeToken({ token, type: 'EMAIL_VERIFY' });
  if (!claimed) {
    throw new EmailAuthError(400, INVALID_LINK_MESSAGE, 'INVALID_TOKEN');
  }

  const user = await User.findById(claimed.userId);
  if (!user || !user.isActive) {
    throw new EmailAuthError(400, INVALID_LINK_MESSAGE, 'INVALID_TOKEN');
  }

  if (user.emailVerifiedAt === null) {
    await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: new Date() } });
    await activatePendingBrand(user);
    await announceVerifiedProvider(user);
  }
  return { verified: true };
}

async function resendVerification({ email, portal }) {
  const user = await User.findOne({ email, accountType: accountTypeForPortal(portal) });
  if (user && user.isActive && user.emailVerifiedAt === null) {
    await sendVerificationEmail(user);
  }
  return { message: RESEND_GENERIC_MESSAGE };
}

async function requestPasswordReset({ email, portal }) {
  const user = await User.findOne({ email, accountType: accountTypeForPortal(portal) });
  if (user && user.isActive) {
    try {
      await deliverPasswordResetEmail(user);
    } catch (err) {
      console.error(`[email] Could not send password reset to user ${user._id}: ${err.message}`);
    }
  }
  return { message: RESET_GENERIC_MESSAGE };
}

/**
 * Resetting the password proves control of the inbox, so an unverified
 * account is verified by the same step (and a PENDING brand goes live).
 * `replacePasswordHash` bumps passwordVersion, ending every existing session.
 */
async function resetPassword({ token, newPassword }) {
  const claimed = await consumeToken({ token, type: 'PASSWORD_RESET' });
  if (!claimed) {
    throw new EmailAuthError(400, INVALID_LINK_MESSAGE, 'INVALID_TOKEN');
  }

  const user = await User.findById(claimed.userId);
  if (!user || !user.isActive) {
    throw new EmailAuthError(400, INVALID_LINK_MESSAGE, 'INVALID_TOKEN');
  }

  await replacePasswordHash({ userId: user._id, newPassword });
  if (user.emailVerifiedAt === null) {
    await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: new Date() } });
    await activatePendingBrand(user);
    await announceVerifiedProvider(user);
  }
}

module.exports = {
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  EmailAuthError,
  RESET_GENERIC_MESSAGE,
  RESEND_GENERIC_MESSAGE,
};
