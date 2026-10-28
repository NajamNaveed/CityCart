const request = require('supertest');
const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const User = require('../../src/models/user.model');
const AdminPartner = require('../../src/models/adminPartner.model');
const AdminAction = require('../../src/models/adminAction.model');
const {
  createPartner,
  updatePartner,
  resetPartnerPassword,
  AdminPartnerError,
  MAX_ACTIVE_PARTNERS,
} = require('../../src/services/adminPartner.service');
const { loginUser } = require('../../src/services/auth.service');
const { comparePassword, hashPassword } = require('../../src/utils/password');
const app = require('../../src/app');
const { ROLES } = require('../../src/config/roles');
const { ADMIN_PERMISSIONS } = require('../../src/config/adminPermissions');

const TEMP = 'Temp@12345';
const actor = async () => User.create({
  name: 'Platform Owner',
  email: 'owner@citycart.test',
  passwordHash: await hashPassword('Owner@12345'),
  role: ROLES.SUPER_ADMIN,
});

const partnerData = (over = {}) => ({
  name: 'Pat Partner',
  email: 'pat@citycart.test',
  password: TEMP,
  permissions: [ADMIN_PERMISSIONS.BRANDS],
  ...over,
});

beforeAll(async () => {
  await connect();
  await Promise.all([User.init(), AdminPartner.init(), AdminAction.init()]);
});
afterAll(disconnect);
beforeEach(clearAll);

describe('createPartner (real MongoDB)', () => {
  it('creates a platform-admin login and record, forcing a password change', async () => {
    const owner = await actor();
    const created = await createPartner({ actor: owner, data: partnerData() });

    expect(created).toMatchObject({
      permissions: [ADMIN_PERMISSIONS.BRANDS],
      readOnly: false,
      isActive: true,
      user: { name: 'Pat Partner', email: 'pat@citycart.test', mustChangePassword: true },
    });
    expect(JSON.stringify(created)).not.toMatch(/passwordHash/);

    const user = await User.findById(created.user._id).select('+passwordHash');
    expect(user.role).toBe(ROLES.ADMIN_PARTNER);
    expect(user.accountType).toBe('PLATFORM_ADMIN');
    expect(user.mustChangePassword).toBe(true);
    expect(user.passwordHash).not.toBe(TEMP);
    expect(await comparePassword(TEMP, user.passwordHash)).toBe(true);

    const log = await AdminAction.find({ action: 'admin.partner.create' }).lean();
    expect(log).toHaveLength(1);
    expect(String(log[0].actor)).toBe(String(owner._id));
    expect(log[0].actorRole).toBe(ROLES.SUPER_ADMIN);
  });

  it('caps active partners and frees a seat when one is deactivated', async () => {
    const owner = await actor();
    const created = [];
    for (let i = 0; i < MAX_ACTIVE_PARTNERS; i += 1) {
      created.push(await createPartner({ actor: owner, data: partnerData({ email: `p${i}@citycart.test` }) }));
    }

    await expect(
      createPartner({ actor: owner, data: partnerData({ email: 'extra@citycart.test' }) })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'PARTNER_LIMIT_REACHED' } });
    expect(await AdminPartner.countDocuments({ isActive: true })).toBe(MAX_ACTIVE_PARTNERS);

    await updatePartner({ actor: owner, id: created[0]._id, data: { isActive: false } });
    const replacement = await createPartner({ actor: owner, data: partnerData({ email: 'extra@citycart.test' }) });
    expect(replacement.isActive).toBe(true);
    expect(await AdminPartner.countDocuments({ isActive: true })).toBe(MAX_ACTIVE_PARTNERS);
  });

  it('rejects a duplicate email without leaving a half-created account', async () => {
    const owner = await actor();
    await createPartner({ actor: owner, data: partnerData() });

    await expect(createPartner({ actor: owner, data: partnerData({ name: 'Other' }) })).rejects.toBeInstanceOf(
      AdminPartnerError
    );
    expect(await User.countDocuments({ role: ROLES.ADMIN_PARTNER })).toBe(1);
    expect(await AdminPartner.countDocuments()).toBe(1);
  });
});

describe('updatePartner (real MongoDB)', () => {
  it('deactivates both records so the partner cannot authenticate, and logs it', async () => {
    const owner = await actor();
    const created = await createPartner({ actor: owner, data: partnerData() });

    const updated = await updatePartner({ actor: owner, id: created._id, data: { isActive: false } });
    expect(updated.isActive).toBe(false);

    const user = await User.findById(created.user._id);
    expect(user.isActive).toBe(false);
    await expect(loginUser({ email: 'pat@citycart.test', password: TEMP }, 'admin')).rejects.toMatchObject({
      status: 401,
    });

    const log = await AdminAction.find({ action: 'admin.partner.deactivate' }).lean();
    expect(log).toHaveLength(1);
  });

  it('updates permissions and the read-only flag without touching the login', async () => {
    const owner = await actor();
    const created = await createPartner({ actor: owner, data: partnerData() });

    const updated = await updatePartner({
      actor: owner,
      id: created._id,
      data: { permissions: [ADMIN_PERMISSIONS.REVIEWS], readOnly: true, name: 'Renamed' },
    });

    expect(updated).toMatchObject({ permissions: [ADMIN_PERMISSIONS.REVIEWS], readOnly: true, user: { name: 'Renamed' } });
    expect(await AdminAction.countDocuments({ action: 'admin.partner.update' })).toBe(1);
  });
});

describe('resetPartnerPassword (real MongoDB)', () => {
  it('sets a new temporary password, signs the partner out, and logs it', async () => {
    const owner = await actor();
    const created = await createPartner({ actor: owner, data: partnerData() });
    const before = await User.findById(created.user._id);
    expect(before.passwordVersion).toBe(0);

    await resetPartnerPassword({ actor: owner, id: created._id, password: 'Reset@12345' });

    const after = await User.findById(created.user._id).select('+passwordHash');
    expect(after.passwordVersion).toBe(1);
    expect(after.mustChangePassword).toBe(true);
    expect(await comparePassword('Reset@12345', after.passwordHash)).toBe(true);
    expect(await AdminAction.countDocuments({ action: 'admin.partner.reset_password' })).toBe(1);
  });
});

describe('admin portal login (real MongoDB)', () => {
  it('accepts a partner on the admin portal and rejects the other portals', async () => {
    const owner = await actor();
    await createPartner({ actor: owner, data: partnerData() });

    const { user } = await loginUser({ email: 'pat@citycart.test', password: TEMP }, 'admin');
    expect(user.role).toBe(ROLES.ADMIN_PARTNER);
    expect(user.mustChangePassword).toBe(true);

    await expect(loginUser({ email: 'pat@citycart.test', password: TEMP }, 'brand')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('refuses a partner whose record was deactivated behind the login', async () => {
    const owner = await actor();
    const created = await createPartner({ actor: owner, data: partnerData() });
    await AdminPartner.findByIdAndUpdate(created._id, { $set: { isActive: false } });

    await expect(loginUser({ email: 'pat@citycart.test', password: TEMP }, 'admin')).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('partner lifecycle over HTTP (real MongoDB)', () => {
  it('forces the first password change before the dashboard opens', async () => {
    const owner = await actor();
    const created = await createPartner({
      actor: owner,
      data: partnerData({
        permissions: [ADMIN_PERMISSIONS.USERS],
        email: 'web@citycart.test',
      }),
    });

    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/admin/login')
      .send({ email: 'web@citycart.test', password: TEMP });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    const blocked = await agent.get('/api/v1/admin/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await agent
      .patch('/api/v1/auth/password')
      .send({ currentPassword: TEMP, newPassword: 'Chosen@12345', confirmPassword: 'Chosen@12345' });
    expect(changed.status).toBe(200);

    const users = await agent.get('/api/v1/admin/users');
    expect(users.status).toBe(200);

    // The partner can use its area but never manages the team.
    const partners = await agent.get('/api/v1/admin/partners');
    expect(partners.status).toBe(403);
    expect(partners.body.code).toBe('ROLE_NOT_ALLOWED');

    expect(String((await User.findById(created.user._id)).mustChangePassword)).toBe('false');
  });

  it('shows the audit trail of admin actions to the super admin', async () => {
    const owner = await actor();
    await createPartner({ actor: owner, data: partnerData() });

    const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/admin/login').send({ email: owner.email, password: 'Owner@12345' });
    expect(login.status).toBe(200);

    const activity = await agent.get('/api/v1/admin/activity');
    expect(activity.status).toBe(200);
    expect(activity.body.items[0]).toMatchObject({ action: 'admin.partner.create' });
    expect(activity.body.items[0].actor.email).toBe(owner.email);
  });
});
