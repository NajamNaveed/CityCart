const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const Brand = require('../../src/models/brand.model');
const User = require('../../src/models/user.model');
const Employee = require('../../src/models/employee.model');
const {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployee,
  setEmployeePermissions,
  actorPermissionsFor,
} = require('../../src/services/employee.service');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../../src/config/permissions');

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
  await Promise.all([Brand, User, Employee].map((m) => m.init()));
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
  it('deactivates BOTH the employee and the login, and can reactivate', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);

    const off = await updateEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid(), data: { isActive: false } });
    expect(off).toMatchObject({ isActive: false });
    expect((await User.findById(emp.user._id)).isActive).toBe(false);

    const on = await updateEmployee({ brandId: brand._id, id: emp._id, actorUserId: oid(), data: { isActive: true, name: 'Renamed', jobTitle: 'Lead' } });
    expect(on).toMatchObject({ isActive: true, jobTitle: 'Lead' });
    expect((await User.findById(emp.user._id)).name).toBe('Renamed');
    expect((await User.findById(emp.user._id)).isActive).toBe(true);
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

describe('unique employee per user (real MongoDB)', () => {
  it('rejects two employee records for the same login', async () => {
    const brand = await makeBrand();
    const emp = await hire(brand);
    await expect(Employee.create({ userId: emp.user._id, brandId: brand._id })).rejects.toMatchObject({ code: 11000 });
  });
});
