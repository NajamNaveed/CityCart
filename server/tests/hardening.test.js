const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');

const User = require('../src/models/user.model');
const app = require('../src/app');
const { escapeRegex } = require('../src/utils/escapeRegex');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('escapeRegex', () => {
  it('escapes every regex metacharacter', () => {
    expect(escapeRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeRegex('Nike Store 2')).toBe('Nike Store 2');
  });
});

describe('security headers (helmet)', () => {
  it('sets standard hardening headers and hides X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('global error handling', () => {
  it('returns JSON 404 for an unknown route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Route not found.' });
  });

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 413 for an oversized body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe('invalid ObjectId on PATCH routes returns 400, not 500', () => {
  function adminCookie() {
    const admin = {
      _id: new mongoose.Types.ObjectId(),
      role: ROLES.SUPER_ADMIN,
      isActive: true,
    };
    User.findById.mockResolvedValue(admin);
    return ['Cookie', getAuthCookie(admin)];
  }

  it('PATCH /brands/:id', async () => {
    const res = await request(app)
      .patch('/api/v1/brands/not-an-id')
      .set(...adminCookie())
      .send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('PATCH /stores/:id', async () => {
    const res = await request(app)
      .patch('/api/v1/stores/not-an-id')
      .set(...adminCookie())
      .send({ name: 'X' });
    expect(res.status).toBe(400);
  });
});
