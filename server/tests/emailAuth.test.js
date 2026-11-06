const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/authToken.model');
jest.mock('../src/services/password.service');
jest.mock('../src/services/notification.service');
jest.mock('../src/services/email.service');

const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const AuthToken = require('../src/models/authToken.model');
const { sendEmail } = require('../src/services/email.service');
const { replacePasswordHash } = require('../src/services/password.service');
const notifications = require('../src/services/notification.service');
const {
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  RESEND_GENERIC_MESSAGE,
  RESET_GENERIC_MESSAGE,
} = require('../src/services/emailAuth.service');
const { hashAuthToken } = require('../src/utils/authToken');
const app = require('../src/app');

const oid = () => new mongoose.Types.ObjectId();
const TOKEN = 'a'.repeat(64);

const customer = (over = {}) => ({
  _id: oid(),
  name: 'Sana',
  email: 'sana@example.com',
  role: 'CUSTOMER',
  accountType: 'CUSTOMER',
  isActive: true,
  emailVerifiedAt: null,
  ...over,
});
const brandOwner = (over = {}) =>
  customer({ role: 'BRAND_ADMIN', accountType: 'BRAND', brandId: oid(), ...over });

const sentText = () => sendEmail.mock.calls[0][0].text;
const tokenFrom = (path) => sentText().match(new RegExp(`${path}\\?token=([a-f0-9]{64})`))[1];

beforeEach(() => {
  jest.resetAllMocks();
  sendEmail.mockResolvedValue({ delivered: true });
  AuthToken.deleteMany.mockResolvedValue({});
  AuthToken.create.mockImplementation(async ([data]) => [{ _id: oid(), ...data }]);
  replacePasswordHash.mockResolvedValue({ passwordVersion: 1 });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('verifyEmail', () => {
  it('claims the hashed token atomically and verifies the account once', async () => {
    const user = customer();
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: user._id });
    User.findById.mockResolvedValue(user);

    await expect(verifyEmail(TOKEN)).resolves.toEqual({ verified: true });

    expect(AuthToken.findOneAndUpdate).toHaveBeenCalledWith(
      { tokenHash: hashAuthToken(TOKEN), type: 'EMAIL_VERIFY', usedAt: null, expiresAt: { $gt: expect.any(Date) } },
      { $set: { usedAt: expect.any(Date) } },
      { new: true }
    );
    expect(User.updateOne).toHaveBeenCalledWith({ _id: user._id }, { $set: { emailVerifiedAt: expect.any(Date) } });
  });

  it('does nothing more for an account that is already verified', async () => {
    const user = customer({ emailVerifiedAt: new Date() });
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: user._id });
    User.findById.mockResolvedValue(user);

    await verifyEmail(TOKEN);

    expect(User.updateOne).not.toHaveBeenCalled();
    expect(Brand.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unknown, expired, used or malformed token with the same message', async () => {
    AuthToken.findOneAndUpdate.mockResolvedValue(null);

    for (const token of [TOKEN, 'b'.repeat(64)]) {
      await expect(verifyEmail(token)).rejects.toMatchObject({ status: 400, code: 'INVALID_TOKEN' });
    }
    // Too short to be a real token: rejected without touching the database.
    AuthToken.findOneAndUpdate.mockClear();
    await expect(verifyEmail('short')).rejects.toMatchObject({ status: 400, code: 'INVALID_TOKEN' });
    expect(AuthToken.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a token whose account was deactivated or deleted', async () => {
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: oid() });
    User.findById.mockResolvedValue(null);
    await expect(verifyEmail(TOKEN)).rejects.toMatchObject({ status: 400, code: 'INVALID_TOKEN' });

    User.findById.mockResolvedValue(customer({ isActive: false }));
    await expect(verifyEmail(TOKEN)).rejects.toMatchObject({ status: 400, code: 'INVALID_TOKEN' });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('activates a PENDING brand and announces it only after the inbox is proven', async () => {
    const owner = brandOwner();
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: owner._id });
    User.findById.mockResolvedValue(owner);
    Brand.findOneAndUpdate.mockResolvedValue({ _id: owner.brandId, name: 'Fresh Kicks' });

    await verifyEmail(TOKEN);

    expect(Brand.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: owner.brandId, status: 'PENDING' },
      { $set: { status: 'ACTIVE' } },
      { new: true }
    );
    expect(notifications.notifySuperAdminsOfNewBrand).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: owner.brandId, brandName: 'Fresh Kicks', ownerName: owner.name })
    );
    expect(notifications.notifyBrandOwnerWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ userId: owner._id, brandName: 'Fresh Kicks' })
    );
  });

  it('never revives a brand an admin suspended or terminated in the meantime', async () => {
    const owner = brandOwner();
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: owner._id });
    User.findById.mockResolvedValue(owner);
    Brand.findOneAndUpdate.mockResolvedValue(null); // status was not PENDING

    await verifyEmail(TOKEN);

    expect(notifications.notifySuperAdminsOfNewBrand).not.toHaveBeenCalled();
    expect(notifications.notifyBrandOwnerWelcome).not.toHaveBeenCalled();
  });
});

describe('sendVerificationEmail / resendVerification', () => {
  it('stores only the hash and emails a 24-hour, single-use link', async () => {
    const user = customer();

    await expect(sendVerificationEmail(user)).resolves.toBe(true);

    const [{ tokenHash, type, expiresAt }] = AuthToken.create.mock.calls[0][0];
    expect(type).toBe('EMAIL_VERIFY');
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + 25 * 3600 * 1000);

    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    const token = tokenFrom('verify-email');
    expect(hashAuthToken(token)).toBe(tokenHash); // the raw token exists only in the email
    expect(mail.text).toContain(`Hi ${user.name}`);
    expect(mail.text).toContain('24 hours');
    expect(mail.text).toContain('portal=customer');
    expect(sendEmail.mock.calls[0][0].html).toContain('Verify my email');
  });

  it('links a brand account to the seller portal', async () => {
    await sendVerificationEmail(brandOwner());
    expect(sentText()).toContain('portal=brand');
  });

  it('invalidates the previous link when a new one is issued', async () => {
    const user = customer();
    await sendVerificationEmail(user);

    expect(AuthToken.deleteMany).toHaveBeenCalledWith(
      { userId: user._id, type: 'EMAIL_VERIFY', usedAt: null },
      undefined
    );
  });

  it('is best-effort: a provider outage returns false instead of breaking sign-up', async () => {
    sendEmail.mockRejectedValue(new Error('Brevo is down'));
    await expect(sendVerificationEmail(customer())).resolves.toBe(false);
  });

  it('answers "resend" identically whether or not the address exists', async () => {
    User.findOne.mockResolvedValueOnce(null);
    const unknown = await resendVerification({ email: 'nobody@example.com', portal: 'customer' });
    expect(unknown.message).toBe(RESEND_GENERIC_MESSAGE);
    expect(sendEmail).not.toHaveBeenCalled();

    const user = customer();
    User.findOne.mockResolvedValueOnce(user);
    const known = await resendVerification({ email: user.email, portal: 'customer' });
    expect(known.message).toBe(unknown.message);
    expect(User.findOne).toHaveBeenLastCalledWith({ email: user.email, accountType: 'CUSTOMER' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not resend to a verified account or through the wrong portal', async () => {
    User.findOne.mockResolvedValueOnce(customer({ emailVerifiedAt: new Date() }));
    await resendVerification({ email: 'sana@example.com', portal: 'customer' });
    expect(sendEmail).not.toHaveBeenCalled();

    User.findOne.mockResolvedValueOnce(null);
    await resendVerification({ email: 'sana@example.com', portal: 'brand' });
    expect(User.findOne).toHaveBeenLastCalledWith({ email: 'sana@example.com', accountType: 'BRAND' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('requestPasswordReset / resetPassword', () => {
  it('emails a 60-minute, single-use reset link and answers generically for unknown addresses', async () => {
    User.findOne.mockResolvedValueOnce(null);
    const unknown = await requestPasswordReset({ email: 'nobody@example.com', portal: 'customer' });
    expect(unknown.message).toBe(RESET_GENERIC_MESSAGE);
    expect(sendEmail).not.toHaveBeenCalled();

    const user = customer();
    User.findOne.mockResolvedValueOnce(user);
    await requestPasswordReset({ email: user.email, portal: 'customer' });

    const [{ tokenHash, type, expiresAt }] = AuthToken.create.mock.calls[0][0];
    expect(type).toBe('PASSWORD_RESET');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + 61 * 60 * 1000);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    expect(mail.text).toContain('60 minutes');
    expect(mail.text).toContain('portal=customer');
    expect(hashAuthToken(tokenFrom('reset-password'))).toBe(tokenHash);
  });

  it('swallows a provider outage so the response cannot reveal the address', async () => {
    User.findOne.mockResolvedValue(customer());
    sendEmail.mockRejectedValue(new Error('Brevo is down'));

    await expect(requestPasswordReset({ email: 'sana@example.com', portal: 'customer' })).resolves.toEqual({
      message: RESET_GENERIC_MESSAGE,
    });
  });

  it('changes the password through replacePasswordHash, ending every old session', async () => {
    const user = customer({ emailVerifiedAt: new Date() });
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: user._id });
    User.findById.mockResolvedValue(user);

    await resetPassword({ token: TOKEN, newPassword: 'brand-new-pass' });

    expect(AuthToken.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashAuthToken(TOKEN), type: 'PASSWORD_RESET', usedAt: null }),
      { $set: { usedAt: expect.any(Date) } },
      { new: true }
    );
    // replacePasswordHash bumps passwordVersion (invalidate sessions) and clears mustChangePassword.
    expect(replacePasswordHash).toHaveBeenCalledWith({ userId: user._id, newPassword: 'brand-new-pass' });
    expect(User.updateOne).not.toHaveBeenCalled(); // already verified
  });

  it('proves the inbox, so a reset also verifies the account and publishes a PENDING brand', async () => {
    const owner = brandOwner();
    AuthToken.findOneAndUpdate.mockResolvedValue({ userId: owner._id });
    User.findById.mockResolvedValue(owner);
    Brand.findOneAndUpdate.mockResolvedValue({ _id: owner.brandId, name: 'Fresh Kicks' });

    await resetPassword({ token: TOKEN, newPassword: 'brand-new-pass' });

    expect(User.updateOne).toHaveBeenCalledWith({ _id: owner._id }, { $set: { emailVerifiedAt: expect.any(Date) } });
    expect(Brand.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: owner.brandId, status: 'PENDING' },
      { $set: { status: 'ACTIVE' } },
      { new: true }
    );
  });

  it('rejects a used or expired reset token without touching the password', async () => {
    AuthToken.findOneAndUpdate.mockResolvedValue(null);

    await expect(resetPassword({ token: TOKEN, newPassword: 'brand-new-pass' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_TOKEN',
    });
    expect(replacePasswordHash).not.toHaveBeenCalled();
  });
});

describe('HTTP endpoints', () => {
  const post = (path, body) => request(app).post(`/api/v1/auth${path}`).send(body);

  it('POST /verify-email: 200 on success, 400 with INVALID_TOKEN on a bad link', async () => {
    AuthToken.findOneAndUpdate.mockResolvedValueOnce({ userId: oid() });
    User.findById.mockResolvedValueOnce(customer());
    const ok = await post('/verify-email', { token: TOKEN });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toMatch(/verified/i);

    AuthToken.findOneAndUpdate.mockResolvedValueOnce(null);
    const bad = await post('/verify-email', { token: 'b'.repeat(64) });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_TOKEN');
  });

  it('POST /verify-email rejects a token that is not 64 hex characters', async () => {
    const res = await post('/verify-email', { token: 'not-a-token' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(AuthToken.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('POST /verify-email/resend and /forgot-password always answer 200 with the same text', async () => {
    User.findOne.mockResolvedValue(null);

    const resendUnknown = await post('/verify-email/resend', { email: 'nobody@example.com' });
    const forgotUnknown = await post('/forgot-password', { email: 'nobody@example.com' });
    expect(resendUnknown.status).toBe(200);
    expect(forgotUnknown.status).toBe(200);
    expect(resendUnknown.body.message).toBe(RESEND_GENERIC_MESSAGE);
    expect(forgotUnknown.body.message).toBe(RESET_GENERIC_MESSAGE);

    User.findOne.mockResolvedValue(customer());
    const resendKnown = await post('/verify-email/resend', { email: 'sana@example.com' });
    expect(resendKnown.body.message).toBe(resendUnknown.body.message);
  });

  it('POST /reset-password: 200 on success, 400 with INVALID_TOKEN on a bad link', async () => {
    AuthToken.findOneAndUpdate.mockResolvedValueOnce({ userId: oid() });
    User.findById.mockResolvedValueOnce(customer());
    const ok = await post('/reset-password', { token: TOKEN, newPassword: 'brand-new-pass' });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toMatch(/sign in/i);

    AuthToken.findOneAndUpdate.mockResolvedValueOnce(null);
    const bad = await post('/reset-password', { token: 'b'.repeat(64), newPassword: 'brand-new-pass' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_TOKEN');
  });

  it('POST /reset-password refuses a short new password before using the token', async () => {
    const res = await post('/reset-password', { token: TOKEN, newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(AuthToken.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
