const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/order.model');
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(async () => 'HASHED'),
  comparePassword: jest.fn(),
}));
jest.mock('../src/utils/transaction', () => ({
  runInTransaction: (work) => work('SESSION'),
}));
jest.mock('../src/services/notification.service');
jest.mock('../src/services/revocation.service', () => ({
  revokeUserDelivery: jest.fn(),
  clearRiderLocation: jest.fn(),
}));
jest.mock('../src/services/accountAnonymization.service', () => ({
  anonymizeUser: jest.fn(),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const Order = require('../src/models/order.model');
const notifications = require('../src/services/notification.service');
const revocation = require('../src/services/revocation.service');
const { anonymizeUser } = require('../src/services/accountAnonymization.service');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../src/config/permissions');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const brandId = oid();
// A promise that also supports .session(), like a Mongoose query.
const q = (v) => Object.assign(Promise.resolve(v), { session: () => Promise.resolve(v) });

/**
 * Acts as `role`. For employees, `perms` is their own permission list: the
 * mock answers requirePermission's lookup (filter has userId) with the actor
 * record and every other Employee.findOne with `target`.
 */
function actAs(role, { perms = [], target } = {}) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId }) };
  // The logged-in user for authenticate; any other id (e.g. the employee's
  // login looked up while serializing) gets a generic user. Queries support
  // .session() like a real Mongoose query.
  User.findById.mockImplementation((id) => q(String(id) === String(user._id) ? user : mkUser({ _id: id })));
  const actor = { _id: oid(), isActive: true, permissions: perms, userId: user._id, brandId, role: ROLES.BRAND_EMPLOYEE };
  Employee.findOne.mockImplementation((filter) => q(filter && filter.userId && !filter.userId.$ne ? actor : target));
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const mkEmployee = (o = {}) => ({
  _id: oid(), userId: oid(), brandId, role: ROLES.BRAND_EMPLOYEE, permissions: [], isActive: true, jobTitle: 'Clerk', ...o,
});
const mkUser = (o = {}) => ({ _id: oid(), name: 'Sam', email: 'sam@x.com', isActive: true, ...o });

beforeEach(() => {
  jest.resetAllMocks();
  require('../src/utils/password').hashPassword.mockResolvedValue('HASHED');
  Order.countDocuments.mockReturnValue(q(0));
});

describe('access control', () => {
  it('401 unauthenticated; 403 for customers', async () => {
    expect((await request(app).get('/api/v1/employees')).status).toBe(401);
    const { cookie } = actAs(ROLES.CUSTOMER);
    expect((await request(app).get('/api/v1/employees').set(...cookie)).status).toBe(403);
    expect((await request(app).post('/api/v1/employees').set(...cookie).send({})).status).toBe(403);
  });

  it('each endpoint needs its own employees.* permission for an employee', async () => {
    const id = oid();
    const { cookie } = actAs(ROLES.BRAND_EMPLOYEE, { perms: [PERMISSIONS.EMPLOYEES_VIEW] });
    Employee.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) });
    Employee.countDocuments.mockResolvedValue(0);
    expect((await request(app).get('/api/v1/employees').set(...cookie)).status).toBe(200);
    expect((await request(app).post('/api/v1/employees').set(...cookie).send({})).status).toBe(403);
    expect((await request(app).patch(`/api/v1/employees/${id}`).set(...cookie).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/v1/employees/${id}`).set(...cookie)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/employees/${id}/permissions`).set(...cookie).send({ permissions: [] })).status).toBe(403);
  });
});

describe('GET /api/v1/employees and /:id', () => {
  function listWorld(items = [mkEmployee()]) {
    const limit = jest.fn().mockResolvedValue(items);
    Employee.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    Employee.countDocuments.mockResolvedValue(items.length);
    User.find.mockResolvedValue(items.map((e) => mkUser({ _id: e.userId })));
  }

  it('brand admin only ever sees their own brand (a brandId query is ignored)', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    listWorld();
    const res = await request(app).get(`/api/v1/employees?isActive=true&brandId=${oid()}`).set(...cookie);
    expect(res.status).toBe(200);
    expect(Employee.find).toHaveBeenCalledWith({ brandId: brandId.toString(), isActive: true });
    expect(res.body.employees[0].user).toMatchObject({ name: 'Sam', email: 'sam@x.com' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('super admin is platform-wide and may filter by brandId', async () => {
    const { cookie } = actAs(ROLES.SUPER_ADMIN);
    listWorld();
    await request(app).get('/api/v1/employees').set(...cookie);
    expect(Employee.find).toHaveBeenLastCalledWith({});
    const other = oid();
    await request(app).get(`/api/v1/employees?brandId=${other}`).set(...cookie);
    expect(Employee.find).toHaveBeenLastCalledWith({ brandId: other.toString() });
  });

  it("GET /:id is brand-scoped: another brand's employee is 404", async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN, { target: null });
    const id = oid();
    expect((await request(app).get(`/api/v1/employees/${id}`).set(...cookie)).status).toBe(404);
    expect(Employee.findOne).toHaveBeenLastCalledWith({ _id: id.toString(), brandId: brandId.toString() });
    expect((await request(app).get('/api/v1/employees/nope').set(...cookie)).status).toBe(400);
  });
});

describe('POST /api/v1/employees', () => {
  const good = { name: 'Sam', email: 'Sam@X.com', password: 'secret123' };
  const post = (cookie, body = good) => request(app).post('/api/v1/employees').set(...cookie).send(body);

  function createWorld() {
    Brand.findById.mockResolvedValue({ _id: brandId });
    User.findOne.mockReturnValue(q(null));
    User.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
    Employee.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
  }

  it.each([
    ['short password', { ...good, password: 'short' }],
    ['bad email', { ...good, email: 'nope' }],
    ['no name', { email: 'a@b.co', password: 'secret123' }],
    ['unknown permission', { ...good, permissions: ['root.everything'] }],
    ['duplicate permissions', { ...good, permissions: ['products.view', 'products.view'] }],
    ['bad phone', { ...good, phone: 'abc' }],
    ['a privileged role', { ...good, role: 'SUPER_ADMIN' }],
  ])('400 for %s', async (_n, body) => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    expect((await post(cookie, body)).status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('creates a BRAND_EMPLOYEE in the caller\'s brand by default; brandId from the body is ignored; no password in response', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    createWorld();

    const res = await post(cookie, {
      ...good,
      brandId: oid().toString(),
      permissions: [PERMISSIONS.PRODUCTS_VIEW],
      jobTitle: 'Cashier',
    });

    expect(res.status).toBe(201);
    const [[userDoc], opts] = User.create.mock.calls[0];
    expect(userDoc).toMatchObject({
      role: ROLES.BRAND_EMPLOYEE,
      brandId: brandId.toString(),
      email: 'sam@x.com', // lowercased
      passwordHash: 'HASHED', // never the plain password
    });
    expect(userDoc.password).toBeUndefined();
    expect(opts).toEqual({ session: 'SESSION' });
    expect(Employee.create.mock.calls[0][0][0]).toMatchObject({ brandId: brandId.toString(), permissions: ['products.view'], jobTitle: 'Cashier' });
    expect(JSON.stringify(res.body)).not.toMatch(/HASHED|secret123|passwordHash/);
    // The new employee is welcomed once the account truly exists (docs/12 §7).
    expect(notifications.notifyEmployeeCreated).toHaveBeenCalledTimes(1);
    const welcomed = notifications.notifyEmployeeCreated.mock.calls[0][0];
    expect(welcomed).toMatchObject({ brandId: brandId.toString(), jobTitle: 'Cashier' });
    expect(String(welcomed.userId)).toBeTruthy();
  });

  it('409 for an existing email, and on a duplicate-key race', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    createWorld();
    User.findOne.mockReturnValue(q({ _id: oid() }));
    expect((await post(cookie)).status).toBe(409);

    createWorld();
    User.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect((await post(cookie)).status).toBe(409);
  });

  it('SUPER_ADMIN must name the brand; 404 if it does not exist', async () => {
    const { cookie } = actAs(ROLES.SUPER_ADMIN);
    expect((await post(cookie)).status).toBe(400);

    Brand.findById.mockResolvedValue(null);
    expect((await post(cookie, { ...good, brandId: oid().toString() })).status).toBe(404);
  });

  it('a brand admin creates a picker: the login is a PICKER with no brand-team permissions', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    createWorld();

    const res = await post(cookie, { ...good, role: ROLES.PICKER, jobTitle: 'Stock picker' });

    expect(res.status).toBe(201);
    expect(User.create.mock.calls[0][0][0]).toMatchObject({ role: ROLES.PICKER, brandId: brandId.toString() });
    expect(Employee.create.mock.calls[0][0][0]).toMatchObject({ permissions: [], jobTitle: 'Stock picker' });
    expect(res.body.employee.user.role).toBe(ROLES.PICKER);
  });

  it('a picker cannot carry brand-team permissions', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    createWorld();
    const res = await post(cookie, { ...good, role: ROLES.PICKER, permissions: [PERMISSIONS.PRODUCTS_VIEW] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PICKER_NO_PERMISSIONS');
    expect(User.create).not.toHaveBeenCalled();
  });

  it('only the brand owner (or super admin) may create a picker', async () => {
    const { cookie } = actAs(ROLES.BRAND_EMPLOYEE, { perms: [PERMISSIONS.EMPLOYEES_CREATE] });
    createWorld();
    const res = await post(cookie, { ...good, role: ROLES.PICKER });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PICKER_CREATE_FORBIDDEN');
    expect(User.create).not.toHaveBeenCalled();
  });

  it("an employee cannot create someone with permissions they do not hold", async () => {
    const { cookie } = actAs(ROLES.BRAND_EMPLOYEE, { perms: [PERMISSIONS.EMPLOYEES_CREATE, PERMISSIONS.PRODUCTS_VIEW] });
    createWorld();

    let res = await post(cookie, { ...good, permissions: [PERMISSIONS.PRODUCTS_VIEW] });
    expect(res.status).toBe(201);

    res = await post(cookie, { ...good, permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.ORDERS_MANAGE] });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'PERMISSION_ESCALATION', permissions: [PERMISSIONS.ORDERS_MANAGE] });
  });
});

describe('PATCH /api/v1/employees/:id and DELETE', () => {
  function updateWorld(employee = mkEmployee()) {
    Employee.findOne.mockReturnValue(q(employee)); // the scoped current row
    Employee.findOneAndUpdate.mockResolvedValue(employee);
    User.findOneAndUpdate.mockResolvedValue(mkUser({ _id: employee.userId }));
    Employee.countDocuments.mockReturnValue(q(0)); // last membership by default
    return employee;
  }

  it('400 when there is nothing to update', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    expect((await request(app).patch(`/api/v1/employees/${oid()}`).set(...cookie).send({})).status).toBe(400);
  });

  it('updates employee and user, scoped to brand, excluding self; role/permissions in body are ignored', async () => {
    const { cookie, user } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();

    const res = await request(app).patch(`/api/v1/employees/${employee._id}`).set(...cookie)
      .send({ name: 'New Name', jobTitle: 'Lead', isActive: false, role: 'BRAND_ADMIN', permissions: ['products.delete'] });

    expect(res.status).toBe(200);
    expect(Employee.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: employee._id, userId: { $ne: user._id } },
      {
        $set: {
          jobTitle: 'Lead',
          isActive: false,
          removedAt: expect.any(Date),
          removedBy: user._id,
          removalReason: null,
        },
      },
      { new: true, session: 'SESSION' }
    );
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: employee.userId, role: { $in: [ROLES.BRAND_EMPLOYEE, ROLES.PICKER] } },
      { $set: { name: 'New Name' } }, // profile only: the account is not deactivated
      { new: true, session: 'SESSION' }
    );
  });

  it('deactivating the last membership revokes delivery state; another membership keeps it', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();

    await request(app).patch(`/api/v1/employees/${employee._id}`).set(...cookie).send({ isActive: false });
    expect(revocation.revokeUserDelivery).toHaveBeenCalledWith(expect.anything(), { notifications: false });

    jest.clearAllMocks();
    updateWorld(employee);
    Employee.countDocuments.mockReturnValue(q(1)); // still employed elsewhere
    await request(app).patch(`/api/v1/employees/${employee._id}`).set(...cookie).send({ isActive: false });
    expect(revocation.revokeUserDelivery).not.toHaveBeenCalled();
  });

  it("403 when acting on yourself, 404 for another brand's employee", async () => {
    const { cookie, user } = actAs(ROLES.BRAND_ADMIN);
    Employee.findOne.mockReturnValue(q(mkEmployee({ userId: user._id }))); // exists in this brand => self
    let res = await request(app).patch(`/api/v1/employees/${oid()}`).set(...cookie).send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SELF_MODIFICATION');

    Employee.findOne.mockReturnValue(q(null));
    res = await request(app).patch(`/api/v1/employees/${oid()}`).set(...cookie).send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('DELETE removes only this brand membership; the shared account stays active and nothing is hard-deleted', async () => {
    const { cookie, user } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();
    Employee.countDocuments.mockReturnValue(q(1)); // still in another brand

    const res = await request(app).delete(`/api/v1/employees/${employee._id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Employee.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: {
        isActive: false,
        removedAt: expect.any(Date),
        removedBy: user._id,
        removalReason: null,
      },
    });
    // The person may still work for another brand, so the login and delivery
    // state are untouched.
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Employee.deleteOne).not.toHaveBeenCalled();
    expect(revocation.revokeUserDelivery).not.toHaveBeenCalled();
  });

  it('DELETE of the last membership revokes that person\'s delivery state', async () => {
    const { cookie, user } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();
    Employee.countDocuments.mockReturnValue(q(0));

    const res = await request(app).delete(`/api/v1/employees/${employee._id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(String(revocation.revokeUserDelivery.mock.calls[0][0])).toBe(String(employee.userId));
    expect(revocation.revokeUserDelivery).toHaveBeenCalledWith(expect.anything(), { notifications: false });
    expect(user._id).toBeTruthy();
  });

  it('?purge=account anonymizes the account and frees the email', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();
    Employee.countDocuments.mockReturnValue(q(0));
    anonymizeUser.mockResolvedValue(mkUser({ _id: employee.userId, name: 'Deleted user' }));

    const res = await request(app).delete(`/api/v1/employees/${employee._id}?purge=account`).set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Employee account deleted');
    expect(anonymizeUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: employee.userId, session: 'SESSION' })
    );
    expect(String(revocation.revokeUserDelivery.mock.calls[0][0])).toBe(String(employee.userId));
    expect(revocation.revokeUserDelivery).toHaveBeenCalledWith(expect.anything(), { notifications: true });
  });

  it('refuses to purge while the person still works for another brand', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();
    Employee.countDocuments.mockReturnValue(q(1));

    const res = await request(app).delete(`/api/v1/employees/${employee._id}?purge=account`).set(...cookie);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_HAS_OTHER_MEMBERSHIPS');
    expect(anonymizeUser).not.toHaveBeenCalled();
  });

  it('refuses to remove a picker who still has orders to finish', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld(mkEmployee({ role: ROLES.PICKER }));
    Order.countDocuments.mockReturnValue(q(2));

    const res = await request(app).delete(`/api/v1/employees/${employee._id}`).set(...cookie);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({ code: 'PICKER_HAS_OPEN_ORDERS', openOrders: 2 }));
    expect(Employee.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/employees/:id/permissions', () => {
  const put = (cookie, id, permissions) =>
    request(app).patch(`/api/v1/employees/${id}/permissions`).set(...cookie).send({ permissions });

  function permWorld(target) {
    Employee.findOneAndUpdate.mockImplementation(async (f, u) => ({ ...target, permissions: u.$set.permissions }));
  }

  it('brand admin replaces the permission set; change is logged with added/removed', async () => {
    const target = mkEmployee({ permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.ORDERS_VIEW] });
    const { cookie, user } = actAs(ROLES.BRAND_ADMIN, { target });
    permWorld(target);

    const res = await put(cookie, target._id, [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.INVENTORY_VIEW]);

    expect(res.status).toBe(200);
    const [filter, update] = Employee.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: target._id, permissions: target.permissions }); // optimistic guard
    expect(update.$set.permissions).toEqual([PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.INVENTORY_VIEW]);
    expect(update.$push.permissionHistory.$each[0]).toMatchObject({
      by: user._id,
      added: [PERMISSIONS.INVENTORY_VIEW],
      removed: [PERMISSIONS.ORDERS_VIEW],
    });
    // The employee is told what changed (docs/12 §7).
    expect(notifications.notifyEmployeePermissionsChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: target.userId,
        added: [PERMISSIONS.INVENTORY_VIEW],
        removed: [PERMISSIONS.ORDERS_VIEW],
      })
    );
  });

  it.each([
    ['unknown permission', ['root.everything']],
    ['duplicates', ['products.view', 'products.view']],
  ])('400 for %s', async (_n, perms) => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    expect((await put(cookie, oid(), perms)).status).toBe(400);
  });

  it('403 when an employee tries to change their OWN permissions', async () => {
    const actorUserId = oid();
    const target = mkEmployee({ userId: actorUserId });
    const user = { _id: actorUserId, role: ROLES.BRAND_EMPLOYEE, isActive: true, brandId };
    User.findById.mockResolvedValue(user);
    Employee.findOne.mockImplementation((f) =>
      q(f.userId ? { isActive: true, permissions: [PERMISSIONS.EMPLOYEES_MANAGE_PERMISSIONS], userId: actorUserId } : target)
    );

    const res = await put(['Cookie', getAuthCookie(user)], target._id, [PERMISSIONS.PRODUCTS_DELETE]);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SELF_MODIFICATION');
    expect(Employee.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('400 when the target is a picker, who never holds brand-team permissions', async () => {
    const target = mkEmployee();
    const { cookie, user } = actAs(ROLES.BRAND_ADMIN, { target });
    User.findById.mockImplementation(async (id) =>
      String(id) === String(user._id) ? user : mkUser({ _id: id, role: ROLES.PICKER })
    );

    const res = await put(cookie, target._id, [PERMISSIONS.PRODUCTS_VIEW]);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PICKER_NO_PERMISSIONS');
    expect(Employee.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('403 PERMISSION_ESCALATION: an employee cannot grant or revoke what they do not hold', async () => {
    const target = mkEmployee({ permissions: [PERMISSIONS.ORDERS_VIEW] });
    const { cookie } = actAs(ROLES.BRAND_EMPLOYEE, {
      perms: [PERMISSIONS.EMPLOYEES_MANAGE_PERMISSIONS, PERMISSIONS.PRODUCTS_VIEW],
      target,
    });
    permWorld(target);

    // grant something the actor lacks
    let res = await put(cookie, target._id, [PERMISSIONS.ORDERS_VIEW, PERMISSIONS.PRODUCTS_DELETE]);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'PERMISSION_ESCALATION', permissions: [PERMISSIONS.PRODUCTS_DELETE] });

    // revoke something the actor lacks (orders.view)
    res = await put(cookie, target._id, []);
    expect(res.status).toBe(403);
    expect(res.body.permissions).toEqual([PERMISSIONS.ORDERS_VIEW]);
    expect(Employee.findOneAndUpdate).not.toHaveBeenCalled();

    // granting something the actor DOES hold is fine
    res = await put(cookie, target._id, [PERMISSIONS.ORDERS_VIEW, PERMISSIONS.PRODUCTS_VIEW]);
    expect(res.status).toBe(200);
  });

  it("404 for another brand's employee; 409 when changed concurrently", async () => {
    let { cookie } = actAs(ROLES.BRAND_ADMIN, { target: null });
    expect((await put(cookie, oid(), [])).status).toBe(404);

    const target = mkEmployee();
    ({ cookie } = actAs(ROLES.BRAND_ADMIN, { target }));
    Employee.findOneAndUpdate.mockResolvedValue(null);
    const res = await put(cookie, target._id, [PERMISSIONS.PRODUCTS_VIEW]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMPLOYEE_CHANGED');
  });

  it('super admin may manage any brand\'s employee (unscoped)', async () => {
    const target = mkEmployee();
    const { cookie } = actAs(ROLES.SUPER_ADMIN, { target });
    permWorld(target);
    const res = await put(cookie, target._id, [PERMISSIONS.PRODUCTS_VIEW]);
    expect(res.status).toBe(200);
    expect(Employee.findOne).toHaveBeenLastCalledWith({ _id: target._id.toString() });
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.PRODUCTS_VIEW);
  });
});
