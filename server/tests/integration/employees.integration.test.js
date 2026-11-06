const mongoose = require('mongoose');
const request = require('supertest');

const { connect, disconnect, clearAll } = require('./db');
const Brand = require('../../src/models/brand.model');
const User = require('../../src/models/user.model');
const Employee = require('../../src/models/employee.model');
const app = require('../../src/app');
const {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  removeEmployee,
  setEmployeePermissions,
  actorPermissionsFor,
} = require('../../src/services/employee.service');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../../src/config/permissions');
const DeviceToken = require('../../src/models/deviceToken.model');

const oid = () => new mongoose.Types.ObjectId();
let n = 0;

const makeBrand = () => {
  n += 1;
  return Brand.create({ name: `B${n}`, slug: `b${n}`, cityId: oid(), status: 'ACTIVE' });
};
const data = (over = {}) => {
  n += 1;
  return { name: `Emp${n}`, email: `emp${n}@x.com`, password: 'secret123', ...over };
};
const hire = (brand, over = {}, actorPermissions = ALL_PERMISSIONS) =>
  createEmployee({ brandId: brand._id, actorPermissions, data: data(over) });
const ok = (r) => r.filter((x) => x.status === 'fulfilled');

beforeAll(async () => {
  await connect();
  await Promise.all([Brand, User, Employee, DeviceToken].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(clearAll);

describe('createEmployee (real MongoDB)', () => {
  it('creates a BRAND_EMPLOYEE login and employee record in the brand, with a hashed password', async () => {
    const brand = await makeBrand();
    const created = await hire(brand, { permissions: [PERMISSIONS.PRODUCTS_VIEW], jobTitle: 'Clerk', email: 'Mixed@Case.com' });

    expect(created).toMatchObject({ jobTitle: 'Clerk', permissions: ['products.view'], isActive: true });
    expect(created.user.email).toBe('mixed@case.com');

    const user = await User.findById(created.user._id).select('+passwordHash');
    expect(user.role).toBe('BRAND_EMPLOYEE');
    expect(String(user.brandId)).toBe(String(brand._id));
    expect(user.passwordHash).not.toBe('secret123');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(created)).not.toMatch(/passwordHash/);
  });

  it('creates a picker with a PICKER login and no brand-team permissions', async () => {
    const brand = await makeBrand();
    const created = await createEmployee({
      brandId: brand._id,
      actorRole: 'BRAND_ADMIN',
      actorPermissions: ALL_PERMISSIONS,
      data: data({ role: 'PICKER', jobTitle: 'Stock picker' }),
    });

    expect(created).toMatchObject({ jobTitle: 'Stock picker', permissions: [], isActive: true });
    expect(created.user.role).toBe('PICKER');
    const user = await User.findById(created.user._id);
    expect(user.role).toBe('PICKER');
    expect(String(user.brandId)).toBe(String(brand._id));
    expect((await Employee.findById(created._id)).permissions).toEqual([]);
  });

  it('refuses a picker from an employee, or one carrying permissions, without writing anything', async () => {
    const brand = await makeBrand();
    await expect(
      createEmployee({
        brandId: brand._id,
        actorRole: 'BRAND_EMPLOYEE',
        actorPermissions: ALL_PERMISSIONS,
        data: data({ role: 'PICKER' }),
      })
    ).rejects.toMatchObject({ status: 403, extra: { code: 'PICKER_CREATE_FORBIDDEN' } });
    await expect(
      createEmployee({
        brandId: brand._id,
        actorRole: 'BRAND_ADMIN',
        actorPermissions: ALL_PERMISSIONS,
        data: data({ role: 'PICKER', permissions: [PERMISSIONS.PRODUCTS_VIEW] }),
      })
    ).rejects.toMatchObject({ status: 400, extra: { code: 'PICKER_NO_PERMISSIONS' } });
    expect(await User.countDocuments()).toBe(0);
    expect(await Employee.countDocuments()).toBe(0);
  });

  it('ROLLS BACK the new login if the employee record cannot be created', async () => {
    const brand = await makeBrand();
    const spy = jest.spyOn(Employee, 'create').mockRejectedValueOnce(new Error('employee write failed'));
    await expect(hire(brand, { email: 'ghost@x.com' })).rejects.toThrow('employee write failed');
    spy.mockRestore();

    expect(await User.countDocuments({ email: 'ghost@x.com' })).toBe(0);
    expect(await Employee.countDocuments()).toBe(0);
  });

  it('rejects a duplicate email (409) even for the same brand', async () => {
    const brand = await makeBrand();
    await hire(brand, { email: 'dup@x.com' });
    await expect(hire(brand, { email: 'dup@x.com' })).rejects.toMatchObject({ status: 409 });
  });

  it('6 concurrent creations with the same email produce exactly one account', async () => {
    const brand = await makeBrand();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => hire(brand, { email: 'race@x.com' })));

    expect(ok(results)).toHaveLength(1);
    expect(await User.countDocuments({ email: 'race@x.com' })).toBe(1);
    expect(await Employee.countDocuments()).toBe(1);
  });

  it('refuses initial permissions the creator does not hold', async () => {
    const brand = await makeBrand();
    await expect(
      hire(brand, { permissions: [PERMISSIONS.ORDERS_MANAGE] }, [PERMISSIONS.EMPLOYEES_CREATE])
    ).rejects.toMatchObject({ status: 403, extra: { code: 'PERMISSION_ESCALATION' } });
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('brand isolation (real MongoDB)', () => {
  it('list/get/update/permissions never cross brands', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    const empA = await hire(a);
    await hire(b);

    const listA = await listEmployees({ brandId: a._id });
    expect(listA.items).toHaveLength(1);
    expect(listA.items[0]._id).toEqual(empA._id);
    expect((await listEmployees({ brandId: null })).items).toHaveLength(2); // super admin

    await expect(getEmployee({ brandId: b._id, id: empA._id })).rejects.toMatchObject({ status: 404 });
    await expect(updateEmployee({ brandId: b._id, id: empA._id, actorUserId: oid(), data: { name: 'Hacked' } }))
      .rejects.toMatchObject({ status: 404 });
    await expect(
      setEmployeePermissions({ brandId: b._id, id: empA._id, actorUserId: oid(), actorPermissions: ALL_PERMISSIONS, permissions: ['products.view'] })
    ).rejects.toMatchObject({ status: 404 });

    expect((await User.findById(empA.user._id)).name).not.toBe('Hacked');
  });
});

describe('update and deactivation (real MongoDB)', () => {
  it('removes only this membership and records who, when and why; the shared login stays active', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);
    const actorId = oid();

    const off = await updateEmployee({
      brandId: brand._id, id: emp._id, actorUserId: actorId,
      data: { isActive: false, removalReason: 'Left the company' },
    });
    expect(off).toMatchObject({ isActive: false });
    expect(off.removedAt).toBeInstanceOf(Date);

    const stored = await Employee.findById(emp._id);
    expect(String(stored.removedBy)).toBe(String(actorId));
    expect(stored.removalReason).toBe('Left the company');
    // The account is shared by every membership: removal never disables it.
    expect((await User.findById(emp.user._id)).isActive).toBe(true);
  });

  it('reactivation clears the removal trail and can rename the person', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);
    await updateEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid(), data: { isActive: false } });

    const on = await updateEmployee({
      brandId: brand._id, id: emp._id, actorUserId: oid(),
      data: { isActive: true, name: 'Renamed', jobTitle: 'Lead' },
    });
    expect(on).toMatchObject({ isActive: true, jobTitle: 'Lead', removedAt: null });
    const stored = await Employee.findById(emp._id);
    expect(stored.removedBy).toBeNull();
    expect(stored.removalReason).toBeNull();
    expect((await User.findById(emp.user._id)).name).toBe('Renamed');
  });

  it('an employee cannot modify their own account', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);
    await expect(
      updateEmployee({ brandId: brand._id, id: emp._id, actorUserId: emp.user._id, data: { isActive: false } })
    ).rejects.toMatchObject({ status: 403, extra: { code: 'SELF_MODIFICATION' } });
    expect((await User.findById(emp.user._id)).isActive).toBe(true);
  });

  it('never alters a non-employee login even if ids are mixed up', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);
    await User.updateOne({ _id: emp.user._id }, { $set: { role: 'BRAND_ADMIN' } }); // tampered role
    await updateEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid(), data: { name: 'Nope' } });
    expect((await User.findById(emp.user._id)).name).not.toBe('Nope'); // role guard held
  });
});

describe('permissions (real MongoDB)', () => {
  it('replaces the set and records who changed what', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand, { permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.ORDERS_VIEW] });
    const admin = oid();

    const updated = await setEmployeePermissions({
      brandId: brand._id, id: emp._id, actorUserId: admin, actorPermissions: ALL_PERMISSIONS,
      permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.INVENTORY_VIEW],
    });

    expect(updated.permissions).toEqual(['products.view', 'inventory.view']);
    const stored = await Employee.findById(emp._id);
    expect(stored.permissionHistory).toHaveLength(1);
    expect(stored.permissionHistory[0]).toMatchObject({ added: ['inventory.view'], removed: ['orders.view'] });
    expect(String(stored.permissionHistory[0].by)).toBe(String(admin));
  });

  it('blocks escalation and self-assignment against the real database', async () => {
    const brand = await makeBrand();
    const manager = await hire(brand, { permissions: [PERMISSIONS.EMPLOYEES_MANAGE_PERMISSIONS, PERMISSIONS.PRODUCTS_VIEW] });
    const clerk = await hire(brand, { permissions: [PERMISSIONS.ORDERS_VIEW] });
    const managerPerms = actorPermissionsFor({ role: 'BRAND_EMPLOYEE' }, await Employee.findById(manager._id));

    await expect(
      setEmployeePermissions({ brandId: brand._id, id: clerk._id, actorUserId: manager.user._id, actorPermissions: managerPerms, permissions: [PERMISSIONS.ORDERS_VIEW, PERMISSIONS.PRODUCTS_DELETE] })
    ).rejects.toMatchObject({ status: 403, extra: { code: 'PERMISSION_ESCALATION' } });

    await expect(
      setEmployeePermissions({ brandId: brand._id, id: manager._id, actorUserId: manager.user._id, actorPermissions: managerPerms, permissions: ALL_PERMISSIONS })
    ).rejects.toMatchObject({ status: 403, extra: { code: 'SELF_MODIFICATION' } });

    expect((await Employee.findById(clerk._id)).permissions).toEqual(['orders.view']);
    expect((await Employee.findById(manager._id)).permissions).toHaveLength(2);
  });

  it('concurrent permission changes never corrupt the set or the audit log', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);
    const sets = [['products.view'], ['orders.view'], ['inventory.view'], ['delivery.view'], ['payments.view']];

    const results = await Promise.allSettled(
      sets.map((permissions) =>
        setEmployeePermissions({ brandId: brand._id, id: emp._id, actorUserId: oid(), actorPermissions: ALL_PERMISSIONS, permissions })
      )
    );

    const stored = await Employee.findById(emp._id);
    expect(ok(results).length).toBeGreaterThan(0);
    expect(sets.map((s) => s[0])).toContain(stored.permissions[0]);
    expect(stored.permissions).toHaveLength(1); // exactly one set won, never a blend
    expect(stored.permissionHistory).toHaveLength(ok(results).length); // one log entry per applied change
  });
});

describe('multi-brand memberships (real MongoDB)', () => {
  it('one account can hold a membership in two brands without duplicating the login', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    const first = await hire(a, { email: 'shared@x.com', permissions: [PERMISSIONS.PRODUCTS_VIEW] });
    const second = await hire(b, { email: 'shared@x.com', permissions: [PERMISSIONS.ORDERS_VIEW] });

    expect(String(second.user._id)).toBe(String(first.user._id));
    expect(await User.countDocuments({ email: 'shared@x.com', accountType: 'BRAND' })).toBe(1);
    const memberships = await Employee.find({ userId: first.user._id }).sort({ brandId: 1 });
    expect(memberships).toHaveLength(2);
    expect(new Set(memberships.map((m) => String(m.brandId)))).toEqual(new Set([String(a._id), String(b._id)]));
    expect(memberships.map((m) => m.permissions).flat().sort()).toEqual(['orders.view', 'products.view']);
  });

  it('refuses a second active membership in the same brand', async () => {
    const brand = await makeBrand();
    await hire(brand, { email: 'twice@x.com' });
    await expect(hire(brand, { email: 'twice@x.com' })).rejects.toMatchObject({
      status: 409,
      extra: { code: 'ALREADY_MEMBER' },
    });
    expect(await Employee.countDocuments()).toBe(1);
  });

  it('does not let an owner or picker join another brand', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    await User.create({
      name: 'Owner', email: 'owner@x.com', passwordHash: 'x', role: 'BRAND_ADMIN', accountType: 'BRAND', brandId: a._id,
    });
    await expect(hire(b, { email: 'owner@x.com' })).rejects.toMatchObject({
      status: 409,
      extra: { code: 'ACCOUNT_ROLE_CONFLICT' },
    });
  });

  it('removing one membership leaves the other intact, and re-adding reactivates with fresh access', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    const inA = await hire(a, { email: 'shared@x.com', permissions: [PERMISSIONS.PRODUCTS_VIEW] });
    await hire(b, { email: 'shared@x.com', permissions: [PERMISSIONS.ORDERS_VIEW] });

    await updateEmployee({ brandId: a._id, id: inA._id, actorUserId: oid(), data: { isActive: false, removalReason: 'Moved on' } });

    expect((await Employee.findById(inA._id)).isActive).toBe(false);
    const inB = await Employee.findOne({ userId: inA.user._id, brandId: b._id });
    expect(inB.isActive).toBe(true);
    expect((await User.findById(inA.user._id)).isActive).toBe(true);

    // The same person can be hired back; the old row is revived, not duplicated.
    const again = await hire(a, { email: 'shared@x.com', permissions: [PERMISSIONS.INVENTORY_VIEW], jobTitle: 'Fresh start' });
    expect(String(again._id)).toBe(String(inA._id));
    const revived = await Employee.findById(inA._id);
    expect(revived).toMatchObject({ isActive: true, jobTitle: 'Fresh start', permissions: ['inventory.view'], removalReason: null });
    expect(revived.removedBy).toBeNull();
    expect(await Employee.countDocuments({ userId: inA.user._id })).toBe(2);
  });

  it('a removed person with no remaining membership cannot sign in, but can be re-added', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand, { email: 'back@x.com' });
    await updateEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid(), data: { isActive: false } });

    const denied = await request(app)
      .post('/api/v1/auth/brand/login')
      .send({ email: 'back@x.com', password: 'secret123' });
    expect(denied.status).toBe(401);

    await expect(hire(brand, { email: 'back@x.com' })).resolves.toMatchObject({ isActive: true });
  });
});

describe('removal, account deletion and email reuse (real MongoDB)', () => {
  it('removing one of two memberships keeps the account, email and devices usable', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    const inA = await hire(a, { email: 'shared@x.com' });
    await hire(b, { email: 'shared@x.com' });
    await DeviceToken.create({ userId: inA.user._id, token: 'device-shared' });

    await removeEmployee({ brandId: a._id, id: inA._id, actorUserId: oid(), removalReason: 'Left this brand' });

    expect((await Employee.findById(inA._id)).isActive).toBe(false);
    expect((await Employee.findOne({ userId: inA.user._id, brandId: b._id })).isActive).toBe(true);
    const user = await User.findById(inA.user._id);
    expect(user.isActive).toBe(true);
    expect(user.deletedAt).toBeNull();
    expect(user.email).toBe('shared@x.com');
    expect(await DeviceToken.countDocuments({ userId: inA.user._id })).toBe(1);
  });

  it('refuses to delete the account while another brand still employs the person', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    const inA = await hire(a, { email: 'shared@x.com' });
    await hire(b, { email: 'shared@x.com' });

    await expect(
      removeEmployee({ brandId: a._id, id: inA._id, actorUserId: oid(), purge: true })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'ACCOUNT_HAS_OTHER_MEMBERSHIPS' } });
    expect((await User.findById(inA.user._id)).email).toBe('shared@x.com');
    expect((await Employee.findById(inA._id)).isActive).toBe(true);
  });

  it('deleting the last membership anonymizes the account, frees the email and revokes devices', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand, { email: 'gone@x.com' });
    await DeviceToken.create({ userId: emp.user._id, token: 'device-gone' });

    const result = await removeEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid(), purge: true });

    expect(result).toMatchObject({ lastMembership: true, purged: true });
    const stored = await User.findById(emp.user._id).select('+passwordHash');
    expect(stored.email).toBe(`deleted+${emp.user._id}@deleted.invalid`);
    expect(stored.name).toBe('Deleted user');
    expect(stored.phone).toBeUndefined();
    expect(stored.isActive).toBe(false);
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(stored.passwordVersion).toBe(1);
    expect(stored.passwordHash).not.toBe('secret123');
    expect(await DeviceToken.countDocuments({ userId: emp.user._id })).toBe(0);
    // the Employee row and its id survive for history
    expect(await Employee.countDocuments({ _id: emp._id })).toBe(1);

    // the freed email can start over as a brand-new account
    const again = await hire(brand, { email: 'gone@x.com' });
    expect(String(again.user._id)).not.toBe(String(emp.user._id));
    expect(String(again._id)).not.toBe(String(emp._id));
    expect(again.user.email).toBe('gone@x.com');
  });

  it('removing the last membership without purge keeps the email blocked until the account is deleted', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand, { email: 'kept@x.com' });

    await removeEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid() });

    expect((await User.findById(emp.user._id)).email).toBe('kept@x.com');
    // re-adding the same person revives the membership instead of duplicating the login
    const again = await hire(brand, { email: 'kept@x.com' });
    expect(String(again.user._id)).toBe(String(emp.user._id));
    expect(String(again._id)).toBe(String(emp._id));
  });

  it('refuses to remove yourself', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);

    await expect(
      removeEmployee({ brandId: brand._id, id: emp._id, actorUserId: emp.user._id })
    ).rejects.toMatchObject({ status: 403, extra: { code: 'SELF_MODIFICATION' } });
    expect((await Employee.findById(emp._id)).isActive).toBe(true);
  });
});

describe('workspace login (real MongoDB)', () => {
  const login = (email, password = 'secret123', client) => {
    const call = request(app).post(client === 'staff' ? '/api/v1/auth/staff/login' : '/api/v1/auth/brand/login');
    if (client) call.set('X-Client', client);
    return call.send({ email, password });
  };

  it('asks a multi-brand employee to choose, then scopes the session to the chosen brand', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    await hire(a, { email: 'shared@x.com', permissions: [PERMISSIONS.PRODUCTS_VIEW] });
    await hire(b, { email: 'shared@x.com', permissions: [PERMISSIONS.ORDERS_VIEW] });

    const first = await login('shared@x.com');
    expect(first.status).toBe(409);
    expect(first.body.code).toBe('WORKSPACE_REQUIRED');
    expect(first.body.memberships).toHaveLength(2);
    expect(first.headers['set-cookie']).toBeUndefined();

    const agent = request.agent(app);
    const chosen = await agent
      .post('/api/v1/auth/workspace')
      .send({ workspaceToken: first.body.workspaceToken, brandId: String(b._id) });
    expect(chosen.status).toBe(200);
    expect(chosen.body.user).toMatchObject({ role: 'BRAND_EMPLOYEE', brandId: String(b._id) });

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ brandId: String(b._id) });
    expect(me.body.user.permissions).toEqual(['orders.view']);
    expect(await Brand.countDocuments()).toBe(2);
  });

  it('refuses a workspace the person no longer belongs to, even with a valid token', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    await hire(a, { email: 'shared@x.com' });
    const inB = await hire(b, { email: 'shared@x.com' });

    const first = await login('shared@x.com');
    expect(first.status).toBe(409);

    await updateEmployee({ brandId: b._id, id: inB._id, actorUserId: oid(), data: { isActive: false } });
    const res = await request(app)
      .post('/api/v1/auth/workspace')
      .send({ workspaceToken: first.body.workspaceToken, brandId: String(b._id) });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WORKSPACE_UNAVAILABLE');
  });

  it('keeps the staff-app mark across a workspace switch', async () => {
    const a = await makeBrand();
    const b = await makeBrand();
    await hire(a, { email: 'shared@x.com' });
    await hire(b, { email: 'shared@x.com' });

    const first = await login('shared@x.com', 'secret123', 'staff');
    expect(first.status).toBe(409);
    const chosen = await request(app)
      .post('/api/v1/auth/workspace')
      .set('X-Client', 'staff')
      .send({ workspaceToken: first.body.workspaceToken, brandId: String(a._id) });
    expect(chosen.status).toBe(200);
    expect(chosen.body.token).toBeTruthy();
    expect(chosen.headers['set-cookie']).toBeUndefined();

    const switched = await request(app)
      .post('/api/v1/auth/workspace/switch')
      .set('Authorization', `Bearer ${chosen.body.token}`)
      .send({ brandId: String(b._id) });
    expect(switched.status).toBe(200);
    const payload = require('../../src/utils/jwt').verifyToken(switched.body.token);
    expect(payload).toMatchObject({ client: 'staff', brandId: String(b._id), role: 'BRAND_EMPLOYEE' });
  });
});

