const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');

const User = require('../src/models/user.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { hashPassword, comparePassword } = require('../src/utils/password');
const { getAuthCookie } = require('./helpers/testAuth');
const { verifyToken } = require('../src/utils/jwt');

const CURRENT_PASSWORD = 'current-secret-123';
const NEXT_PASSWORD = 'new-secret-456';

function makeUser(role = ROLES.BRAND_ADMIN, overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: 'Brand Owner',
    email: 'owner@example.com',
    role,
    brandId: new mongoose.Types.ObjectId(),
    passwordVersion: 0,
    isActive: true,
    ...overrides,
  };
}

function setPasswordLookup(user, passwordHash) {
  const passwordRecord = { ...user, passwordHash };
  User.findById
    .mockResolvedValueOnce(user)
    .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(passwordRecord) });
  return passwordRecord;
}

beforeEach(() => jest.clearAllMocks());

describe('PATCH /api/v1/auth/password', () => {
  it('requires authentication and is limited to Brand Admins', async () => {
    const unauthenticated = await request(app).patch('/api/v1/auth/password').send({});
    expect(unauthenticated.status).toBe(401);

    const employee = makeUser(ROLES.BRAND_EMPLOYEE);
    User.findById.mockResolvedValue(employee);
    const denied = await request(app)
      .patch('/api/v1/auth/password')
      .set('Cookie', getAuthCookie(employee))
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEXT_PASSWORD, confirmPassword: NEXT_PASSWORD });

    expect(denied.status).toBe(403);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('validates confirmation and new-password length before loading password data', async () => {
    const admin = makeUser();
    User.findById.mockResolvedValue(admin);
    const cookie = getAuthCookie(admin);
    const mismatch = await request(app)
      .patch('/api/v1/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEXT_PASSWORD, confirmPassword: 'different-password' });
    const tooShort = await request(app)
      .patch('/api/v1/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'short', confirmPassword: 'short' });

    expect(mismatch.status).toBe(400);
    expect(tooShort.status).toBe(400);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an incorrect current password without changing the hash', async () => {
    const user = makeUser();
    const oldHash = await hashPassword(CURRENT_PASSWORD);
    setPasswordLookup(user, oldHash);

    const res = await request(app)
      .patch('/api/v1/auth/password')
      .set('Cookie', getAuthCookie(user))
      .send({ currentPassword: 'wrong-current-password', newPassword: NEXT_PASSWORD, confirmPassword: NEXT_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect.');
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rotates the hash and session version, keeping the current tab signed in', async () => {
    const user = makeUser();
    const oldHash = await hashPassword(CURRENT_PASSWORD);
    const passwordRecord = setPasswordLookup(user, oldHash);
    User.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
      ...passwordRecord,
      passwordHash: update.$set.passwordHash,
      passwordVersion: update.$inc.passwordVersion,
    }));

    const res = await request(app)
      .patch('/api/v1/auth/password')
      .set('Cookie', getAuthCookie(user))
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEXT_PASSWORD, confirmPassword: NEXT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Password changed successfully.' });
    expect(JSON.stringify(res.body)).not.toContain(NEXT_PASSWORD);
    const [filter, update] = User.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ _id: user._id, passwordHash: oldHash });
    expect(update.$inc).toEqual({ passwordVersion: 1 });
    expect(update.$set.passwordHash).not.toBe(NEXT_PASSWORD);
    await expect(comparePassword(NEXT_PASSWORD, update.$set.passwordHash)).resolves.toBe(true);
    await expect(comparePassword(CURRENT_PASSWORD, update.$set.passwordHash)).resolves.toBe(false);

    const cookie = res.headers['set-cookie'].find((header) => header.startsWith('auth_token='));
    expect(cookie).toBeDefined();
    const token = cookie.split(';')[0].slice('auth_token='.length);
    expect(verifyToken(token).passwordVersion).toBe(1);
  });

  it('rejects the old session after the password version changes', async () => {
    const oldSessionUser = makeUser();
    const currentUser = { ...oldSessionUser, passwordVersion: 1 };
    User.findById.mockResolvedValue(currentUser);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', getAuthCookie(oldSessionUser));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired session.');
  });
});