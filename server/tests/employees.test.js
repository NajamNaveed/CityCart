const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(async () => 'HASHED'),
  comparePassword: jest.fn(),
}));
jest.mock('../src/utils/transaction', () => ({
  runInTransaction: (work) => work('SESSION'),
}));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
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
  // login looked up while serializing) gets a generic user.
  User.findById.mockImplementation(async (id) => (String(id) === String(user._id) ? user : mkUser({ _id: id })));
  const actor = { isActive: true, permissions: perms, userId: user._id };
  Employee.findOne.mockImplementation((filter) => q(filter && filter.userId && !filter.userId.$ne ? actor : target));
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

const mkEmployee = (o = {}) => ({
  _id: oid(), userId: oid(), brandId, permissions: [], isActive: true, jobTitle: 'Clerk', ...o,
});
const mkUser = (o = {}) => ({ _id: oid(), name: 'Sam', email: 'sam@x.com', isActive: true, ...o });

beforeEach(() => {
  jest.resetAllMocks();
  require('../src/utils/password').hashPassword.mockResolvedValue('HASHED');
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
  ])('400 for %s', async (_n, body) => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    expect((await post(cookie, body)).status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('creates a BRAND_EMPLOYEE in the caller\'s brand; role/brandId from the body are ignored; no password in response', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    createWorld();

    const res = await post(cookie, {
      ...good,
      role: 'SUPER_ADMIN',
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

  it('an employee cannot create someone with permissions they do not hold', async () => {
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
    Employee.findOneAndUpdate.mockResolvedValue(employee);
    User.findOneAndUpdate.mockResolvedValue(mkUser({ _id: employee.userId }));
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
      { _id: employee._id.toString(), brandId: brandId.toString(), userId: { $ne: user._id } },
      { $set: { jobTitle: 'Lead', isActive: false } },
      { new: true, session: 'SESSION' }
    );
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: employee.userId, role: ROLES.BRAND_EMPLOYEE, brandId },
      { $set: { name: 'New Name', isActive: false } }, // only profile/active fields
      { new: true, session: 'SESSION' }
    );
  });

  it('403 when acting on yourself, 404 for another brand\'s employee', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    Employee.findOneAndUpdate.mockResolvedValue(null);
    Employee.findOne.mockReturnValue(q(mkEmployee())); // exists in this brand => self
    let res = await request(app).patch(`/api/v1/employees/${oid()}`).set(...cookie).send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SELF_MODIFICATION');

    Employee.findOne.mockReturnValue(q(null));
    res = await request(app).patch(`/api/v1/employees/${oid()}`).set(...cookie).send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('DELETE only deactivates (employee AND user); nothing is hard-deleted', async () => {
    const { cookie } = actAs(ROLES.BRAND_ADMIN);
    const employee = updateWorld();

    const res = await request(app).delete(`/api/v1/employees/${employee._id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(Employee.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { isActive: false } });
    expect(User.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { isActive: false } });
    expect(Employee.deleteOne).not.toHaveBeenCalled();
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
