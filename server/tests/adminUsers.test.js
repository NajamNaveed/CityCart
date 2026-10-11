const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');

const User = require('../src/models/user.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

function makeUser(role) {
  return { _id: new mongoose.Types.ObjectId(), role, isActive: true };
}

function asUser(user) {
  User.findById.mockResolvedValue(user);
  return ['Cookie', getAuthCookie(user)];
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/v1/admin/users', () => {
  it('returns a paginated, safe user directory to Super Admin', async () => {
    User.aggregate.mockResolvedValue([
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Customer One',
        email: 'customer@example.com',
        role: ROLES.CUSTOMER,
        isActive: true,
        orderCount: 3,
        passwordHash: 'must-never-leak',
      },
    ]);
    User.countDocuments.mockResolvedValue(21);

    const res = await request(app)
      .get('/api/v1/admin/users?search=customer&page=2&limit=10')
      .set(...asUser(makeUser(ROLES.SUPER_ADMIN)));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 21, pages: 3 });
    expect(res.body.users[0]).toMatchObject({ orderCount: 3, role: 'CUSTOMER' });
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
    expect(User.aggregate.mock.calls[0][0][0].$match.$or).toEqual([
      { name: { $regex: 'customer', $options: 'i' } },
      { email: { $regex: 'customer', $options: 'i' } },
    ]);
    expect(User.aggregate.mock.calls[0][0].at(-1).$project).not.toHaveProperty('passwordHash');
  });

  it('rejects non-admin access and invalid query parameters', async () => {
    const denied = await request(app)
      .get('/api/v1/admin/users')
      .set(...asUser(makeUser(ROLES.BRAND_ADMIN)));
    expect(denied.status).toBe(403);

    const invalid = await request(app)
      .get('/api/v1/admin/users?limit=500')
      .set(...asUser(makeUser(ROLES.SUPER_ADMIN)));
    expect(invalid.status).toBe(400);
    expect(User.aggregate).not.toHaveBeenCalled();
  });
});