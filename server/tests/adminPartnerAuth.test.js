const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/adminPartner.model');
jest.mock('../src/models/adminAction.model');
jest.mock('../src/services/adminSettings.service');
jest.mock('../src/services/password.service');

const User = require('../src/models/user.model');
const AdminPartner = require('../src/models/adminPartner.model');
const { getPlatformSettings, updatePlatformSettings } = require('../src/services/adminSettings.service');
const { changePassword } = require('../src/services/password.service');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { ADMIN_PERMISSIONS } = require('../src/config/adminPermissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();

function makeUser(role, over = {}) {
  return { _id: oid(), role, isActive: true, passwordVersion: 0, ...over };
}

function recordOf(user, permissions, over = {}) {
  return { _id: oid(), userId: user._id, permissions, readOnly: false, isActive: true, ...over };
}

// `partner` undefined -> no partner record (super admin / other roles).
function asUser(user, partner = null) {
  User.findById.mockResolvedValue(user);
  AdminPartner.findOne.mockResolvedValue(partner);
  return ['Cookie', getAuthCookie(user)];
}

beforeEach(() => {
  jest.clearAllMocks();
  getPlatformSettings.mockResolvedValue({ commissionRate: 10 });
  updatePlatformSettings.mockImplementation(async (data) => ({ commissionRate: 10, ...data }));
});

describe('admin area permissions (docs/21 §G)', () => {
  it('lets the super admin through every admin area', async () => {
    User.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(...asUser(makeUser(ROLES.SUPER_ADMIN)));

    expect(res.status).toBe(200);
  });

  it('lets a partner through the area it holds', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    User.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(...asUser(user, recordOf(user, [ADMIN_PERMISSIONS.USERS])));

    expect(res.status).toBe(200);
    expect(AdminPartner.findOne).toHaveBeenCalledWith({ userId: user._id });
  });

  it.each([
    ['GET', '/api/v1/admin/brands', ADMIN_PERMISSIONS.BRANDS],
    ['GET', '/api/v1/admin/orders', ADMIN_PERMISSIONS.ORDERS],
    ['GET', '/api/v1/admin/reviews', ADMIN_PERMISSIONS.REVIEWS],
    ['GET', '/api/v1/admin/settings', ADMIN_PERMISSIONS.SETTINGS],
    ['GET', '/api/v1/admin/users', ADMIN_PERMISSIONS.USERS],
    ['GET', '/api/v1/admin/analytics', ADMIN_PERMISSIONS.ANALYTICS],
    ['GET', '/api/v1/payments/events', ADMIN_PERMISSIONS.PAYMENTS],
    ['POST', '/api/v1/blocks', ADMIN_PERMISSIONS.LOCATIONS],
    ['POST', '/api/v1/cities', ADMIN_PERMISSIONS.LOCATIONS],
  ])('refuses %s %s to a partner without that area', async (method, path, permission) => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    const other = permission === ADMIN_PERMISSIONS.USERS ? ADMIN_PERMISSIONS.ORDERS : ADMIN_PERMISSIONS.USERS;

    const res = await request(app)[method.toLowerCase()](path).set(...asUser(user, recordOf(user, [other])));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(res.body.permission).toBe(permission);
  });

  it('refuses every write from a read-only partner, in every area', async () => {
    const cases = [
      ['post', '/api/v1/blocks', ADMIN_PERMISSIONS.LOCATIONS],
      ['post', '/api/v1/cities', ADMIN_PERMISSIONS.LOCATIONS],
      ['post', '/api/v1/admin/brands/' + oid() + '/terminate', ADMIN_PERMISSIONS.BRANDS],
      ['patch', '/api/v1/admin/reviews/' + oid(), ADMIN_PERMISSIONS.REVIEWS],
      ['patch', '/api/v1/admin/settings', ADMIN_PERMISSIONS.SETTINGS],
      ['patch', '/api/v1/payments/' + oid() + '/status', ADMIN_PERMISSIONS.PAYMENTS],
    ];

    for (const [method, path, permission] of cases) {
      const user = makeUser(ROLES.ADMIN_PARTNER);
      const res = await request(app)
        [method](path)
        .set(...asUser(user, recordOf(user, [permission], { readOnly: true })));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('READ_ONLY');
    }
  });

  it('still lets a read-only partner read its areas', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set(...asUser(user, recordOf(user, [ADMIN_PERMISSIONS.SETTINGS], { readOnly: true })));

    expect(res.status).toBe(200);
  });

  it('lets a partner with the area and write access write', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    const res = await request(app)
      .patch('/api/v1/admin/settings')
      .send({ commissionRate: 12 })
      .set(...asUser(user, recordOf(user, [ADMIN_PERMISSIONS.SETTINGS])));

    expect(res.status).toBe(200);
    expect(updatePlatformSettings).toHaveBeenCalled();
  });

  it('refuses a deactivated partner record immediately', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    User.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(...asUser(user, recordOf(user, [ADMIN_PERMISSIONS.USERS], { isActive: false })));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_PARTNER_INACTIVE');
  });

  it('refuses a partner with no record at all', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(...asUser(user, null));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_PARTNER_INACTIVE');
  });

  it.each([ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.CUSTOMER, ROLES.RIDER])(
    'refuses %s the admin area',
    async (role) => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set(...asUser(makeUser(role)));

      expect(res.status).toBe(403);
    }
  );

  it('requires a session at all', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('partner management stays with the super admin', () => {
  it.each([
    ['get', '/api/v1/admin/partners'],
    ['post', '/api/v1/admin/partners'],
    ['get', '/api/v1/admin/activity'],
  ])('refuses %s %s to a partner, even with every area', async (method, path) => {
    const user = makeUser(ROLES.ADMIN_PARTNER);
    const res = await request(app)
      [method](path)
      .set(...asUser(user, recordOf(user, Object.values(ADMIN_PERMISSIONS))));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('lets the super admin list the team', async () => {
    AdminPartner.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: async () => [] }) }) });
    AdminPartner.countDocuments.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/admin/partners')
      .set(...asUser(makeUser(ROLES.SUPER_ADMIN)));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
  });
});

describe('first sign-in password change (docs/21 §G.2)', () => {
  it('blocks a partner until the temporary password is replaced', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER, { mustChangePassword: true });

    const blocked = await request(app)
      .get('/api/v1/admin/users')
      .set(...asUser(user, recordOf(user, Object.values(ADMIN_PERMISSIONS))));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(...asUser(user, recordOf(user, [])));
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);
  });

  it('allows the password change itself, then the flag is gone', async () => {
    const user = makeUser(ROLES.ADMIN_PARTNER, { mustChangePassword: true });
    changePassword.mockResolvedValue({ ...user, passwordVersion: 1, mustChangePassword: false });

    const res = await request(app)
      .patch('/api/v1/auth/password')
      .send({ currentPassword: 'Temp@12345', newPassword: 'Chosen@12345', confirmPassword: 'Chosen@12345' })
      .set(...asUser(user, recordOf(user, [])));

    expect(res.status).toBe(200);
    expect(changePassword).toHaveBeenCalled();
  });
});
