const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');
jest.mock('../src/models/city.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/inventory.model');
jest.mock('../src/utils/password', () => ({ hashPassword: jest.fn(), comparePassword: jest.fn() }));
jest.mock('../src/utils/transaction', () => ({ runInTransaction: (work) => work('SESSION') }));

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const City = require('../src/models/city.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const Inventory = require('../src/models/inventory.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const q = (v) => Object.assign(Promise.resolve(v), { session: () => Promise.resolve(v) });

const application = () => ({
  owner: { name: 'Sara Owner', email: 'Sara@Shop.com', password: 'secret123', phone: '+923001234567' },
  brand: { name: 'Fresh Kicks', cityId: oid().toString(), description: 'Sneakers and sportswear.' },
  store: {
    name: 'Fresh Kicks Store',
    address: { addressLine: 'Shop 5, Main Boulevard', city: 'Faisalabad' },
    contact: { phone: '+923001234567' },
  },
});

function applyWorld() {
  City.findOne.mockResolvedValue({ _id: oid(), isActive: true });
  User.findOne.mockResolvedValue(null);
  Brand.exists.mockResolvedValue(null);
  Store.exists.mockResolvedValue(null);
  Brand.create.mockImplementation(async ([d]) => [{ ...d }]);
  User.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
  Store.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
}

function asRole(role) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

beforeEach(() => {
  jest.resetAllMocks();
  require('../src/utils/password').hashPassword.mockResolvedValue('HASHED');
});

describe('POST /api/v1/brands/apply', () => {
  const post = (body) => request(app).post('/api/v1/brands/apply').send(body);

  const withChange = (fn) => {
    const a = application();
    fn(a);
    return a;
  };

  it.each([
    ['owner phone missing', (a) => delete a.owner.phone],
    ['owner phone invalid', (a) => (a.owner.phone = 'abc')],
    ['weak password', (a) => (a.owner.password = '123')],
    ['bad email', (a) => (a.owner.email = 'nope')],
    ['brand name missing', (a) => delete a.brand.name],
    ['brand description too short', (a) => (a.brand.description = 'short')],
    ['invalid cityId', (a) => (a.brand.cityId = 'xyz')],
    ['store name missing', (a) => delete a.store.name],
    ['store address missing', (a) => delete a.store.address],
    ['store addressLine too short', (a) => (a.store.address.addressLine = 'x')],
    ['store address city missing', (a) => delete a.store.address.city],
    ['store contact phone missing', (a) => delete a.store.contact.phone],
    ['whole section missing', (a) => delete a.store],
  ])('400 and nothing created when: %s', async (_n, mutate) => {
    applyWorld();
    const res = await post(withChange(mutate));
    expect(res.status).toBe(400);
    expect(Brand.create).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
    expect(Store.create).not.toHaveBeenCalled();
  });

  it('is public, creates brand + owner + store instantly ACTIVE, and logs the owner in', async () => {
    applyWorld();
    const res = await post(application());

    expect(res.status).toBe(201);
    expect(res.headers['set-cookie'].join(';')).toMatch(/auth_token=/);
    expect(res.body.message).toBe('Your store is live');

    const [[brandDoc], brandOpts] = Brand.create.mock.calls[0];
    const [[userDoc]] = User.create.mock.calls[0];
    const [[storeDoc]] = Store.create.mock.calls[0];
    expect(brandDoc).toMatchObject({ name: 'Fresh Kicks', slug: 'fresh-kicks', status: 'ACTIVE' });
    expect(brandOpts).toEqual({ session: 'SESSION' });
    expect(userDoc).toMatchObject({ role: ROLES.BRAND_ADMIN, email: 'sara@shop.com', passwordHash: 'HASHED' });
    expect(String(userDoc.brandId)).toBe(String(brandDoc._id)); // owner is bound to the new brand
    expect(storeDoc).toMatchObject({ slug: 'fresh-kicks-store', name: 'Fresh Kicks Store' });
    expect(String(storeDoc.brandId)).toBe(String(brandDoc._id));
    expect(JSON.stringify(res.body)).not.toMatch(/HASHED|secret123|passwordHash/);
  });

  it('status, role and brandId can never be set by the client', async () => {
    applyWorld();
    const body = application();
    body.brand.status = 'PENDING';
    body.owner.role = 'SUPER_ADMIN';
    body.owner.brandId = oid().toString();
    body.status = 'SUSPENDED';

    expect((await post(body)).status).toBe(201);
    expect(Brand.create.mock.calls[0][0][0].status).toBe('ACTIVE');
    expect(User.create.mock.calls[0][0][0].role).toBe(ROLES.BRAND_ADMIN);
  });

  it('400 when the city does not exist or is inactive (looked up as active only)', async () => {
    applyWorld();
    City.findOne.mockResolvedValue(null);
    const res = await post(application());
    expect(res.status).toBe(400);
    expect(City.findOne).toHaveBeenCalledWith({ _id: expect.any(String), isActive: true });
    expect(Brand.create).not.toHaveBeenCalled();
  });

  it('409 for a taken email, brand name or store name', async () => {
    applyWorld();
    User.findOne.mockResolvedValue({ _id: oid() });
    expect((await post(application())).status).toBe(409);

    applyWorld();
    Brand.exists.mockResolvedValue({ _id: oid() });
    let res = await post(application());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/brand/i);

    applyWorld();
    Store.exists.mockResolvedValue({ _id: oid() });
    res = await post(application());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/store/i);
  });

  it('409 when a unique-index race is lost (E11000) and nothing is half-created', async () => {
    applyWorld();
    Store.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key collection: citycart.stores index: slug_1'), { code: 11000 }));
    const res = await post(application());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/store/i);
  });
});

describe('name availability checks (public)', () => {
  it('brand name: available / taken, matched by normalised slug', async () => {
    Brand.exists.mockResolvedValue(null);
    let res = await request(app).get('/api/v1/brands/check-name?name=Fresh%20Kicks');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(Brand.exists).toHaveBeenCalledWith({ slug: 'fresh-kicks' });

    Brand.exists.mockResolvedValue({ _id: oid() });
    res = await request(app).get('/api/v1/brands/check-name?name=FRESH%20KICKS');
    expect(res.body.available).toBe(false);
  });

  it('store name: available / taken', async () => {
    Store.exists.mockResolvedValue({ _id: oid() });
    const res = await request(app).get('/api/v1/stores/check-name?name=Demo%20Store');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(Store.exists).toHaveBeenCalledWith({ slug: 'demo-store' });
  });

  it('400 for a too-short or missing name; a name with no letters is never available', async () => {
    expect((await request(app).get('/api/v1/brands/check-name')).status).toBe(400);
    expect((await request(app).get('/api/v1/stores/check-name?name=a')).status).toBe(400);
    const res = await request(app).get('/api/v1/brands/check-name?name=%21%21%21');
    expect(res.body.available).toBe(false);
    expect(Brand.exists).not.toHaveBeenCalled();
  });
});

describe('/api/v1/admin/brands (super admin)', () => {
  it('401 anonymous; 403 for brand admin and customer', async () => {
    expect((await request(app).get('/api/v1/admin/brands')).status).toBe(401);
    for (const role of [ROLES.BRAND_ADMIN, ROLES.CUSTOMER]) {
      const { cookie } = asRole(role);
      expect((await request(app).get('/api/v1/admin/brands').set(...cookie)).status).toBe(403);
      expect((await request(app).post(`/api/v1/admin/brands/${oid()}/terminate`).set(...cookie).send({ reason: 'long enough reason' })).status).toBe(403);
    }
  });

  it('lists ALL statuses (incl. TERMINATED) with filters and escaped search', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const limit = jest.fn().mockResolvedValue([{ name: 'X' }]);
    Brand.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit }) }) });
    Brand.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/v1/admin/brands?status=TERMINATED&search=(a%2B)').set(...cookie);

    expect(res.status).toBe(200);
    expect(Brand.find).toHaveBeenCalledWith({ status: 'TERMINATED', name: { $regex: '\\(a\\+\\)', $options: 'i' } });
    expect((await request(app).get('/api/v1/admin/brands?status=NOPE').set(...cookie)).status).toBe(400);
  });

  it('GET /:id returns the brand, store and owners; 404 when unknown', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const brand = { _id: oid(), name: 'B' };
    Brand.findById.mockResolvedValue(brand);
    Store.findOne.mockResolvedValue({ name: 'S' });
    User.find.mockResolvedValue([{ _id: oid(), name: 'Owner', email: 'o@x.com', isActive: true, passwordHash: 'SECRET' }]);

    const res = await request(app).get(`/api/v1/admin/brands/${brand._id}`).set(...cookie);

    expect(res.status).toBe(200);
    expect(res.body.owners[0].email).toBe('o@x.com');
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|passwordHash/);

    Brand.findById.mockResolvedValue(null);
    expect((await request(app).get(`/api/v1/admin/brands/${oid()}`).set(...cookie)).status).toBe(404);
  });
});

describe('POST /api/v1/admin/brands/:id/terminate', () => {
  const brandId = oid();
  const term = (cookie, body = { reason: 'Selling counterfeit goods' }) =>
    request(app).post(`/api/v1/admin/brands/${brandId}/terminate`).set(...cookie).send(body);

  function terminateWorld({ orders = [], inTransit = 0, alreadyTerminated = false } = {}) {
    Brand.findOneAndUpdate.mockResolvedValue(alreadyTerminated ? null : { _id: brandId, status: 'TERMINATED' });
    Brand.findById.mockReturnValue(q({ _id: brandId, status: 'TERMINATED' }));
    Store.updateMany.mockResolvedValue({});
    User.updateMany.mockResolvedValue({});
    Employee.updateMany.mockResolvedValue({});
    Order.find.mockReturnValue({ select: () => Promise.resolve(orders.map((o) => ({ _id: o._id }))) });
    Order.countDocuments.mockResolvedValue(inTransit);
    Order.findOneAndUpdate.mockImplementation(async (f) => orders.find((o) => String(o._id) === String(f._id)) || null);
    Inventory.updateOne.mockResolvedValue({});
    Payment.updateMany.mockResolvedValue({});
    Delivery.updateOne.mockResolvedValue({});
  }

  it.each([[{}], [{ reason: 'short' }]])('400 for reason %j', async (body) => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    expect((await term(cookie, body)).status).toBe(400);
    expect(Brand.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('takes the brand offline atomically: status, store, every brand login and employee', async () => {
    const { cookie, user } = asRole(ROLES.SUPER_ADMIN);
    terminateWorld();

    const res = await term(cookie);

    expect(res.status).toBe(200);
    expect(Brand.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: brandId.toString(), status: { $ne: 'TERMINATED' } },
      { $set: { status: 'TERMINATED', terminationReason: 'Selling counterfeit goods', terminatedAt: expect.any(Date), terminatedBy: user._id, accessEndsAt: expect.any(Date) } },
      { new: true, session: 'SESSION' }
    );
    expect(Store.updateMany).toHaveBeenCalledWith({ brandId: brandId.toString() }, { $set: { isActive: false } }, { session: 'SESSION' });
    expect(User.updateMany).toHaveBeenCalledWith(
      { brandId: brandId.toString(), role: { $in: [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE] } },
      // staff are NOT deactivated: time-limited, read-only access instead
      { $set: { accessExpiresAt: expect.any(Date), accessRestricted: true } },
      { session: 'SESSION' }
    );
    expect(Employee.updateMany).not.toHaveBeenCalled();
  });

  it('staff access ends after the grace period: default 24h, or graceHours (0 = immediately)', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const endsIn = () => User.updateMany.mock.calls.at(-1)[1].$set.accessExpiresAt.getTime() - Date.now();
    const HOUR = 3600 * 1000;

    terminateWorld();
    await term(cookie);
    expect(Math.abs(endsIn() - 24 * HOUR)).toBeLessThan(5000);

    terminateWorld();
    await term(cookie, { reason: 'Selling counterfeit goods', graceHours: 5 });
    expect(Math.abs(endsIn() - 5 * HOUR)).toBeLessThan(5000);

    terminateWorld();
    await term(cookie, { reason: 'Selling counterfeit goods', graceHours: 0 });
    expect(endsIn()).toBeLessThanOrEqual(1000); // already expired => instant cut-off
  });

  it.each([[-1], [169], [1.5], ['24']])('400 for graceHours %j', async (graceHours) => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    expect((await term(cookie, { reason: 'Selling counterfeit goods', graceHours })).status).toBe(400);
    expect(Brand.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects every unshipped order: restock, payment cancelled, delivery cancelled; reports in-transit orders', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const p1 = oid();
    const orders = [
      { _id: oid(), items: [{ productId: p1, quantity: 2 }] },
      { _id: oid(), items: [{ productId: p1, quantity: 1 }] },
    ];
    terminateWorld({ orders, inTransit: 3 });

    const res = await term(cookie);

    expect(res.body).toMatchObject({ rejectedOrders: 2, inTransitOrders: 3, failedOrders: [] });
    expect(Order.find).toHaveBeenCalledWith({
      brandId: brandId.toString(),
      orderStatus: { $in: ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT'] },
    });
    const [filter, update] = Order.findOneAndUpdate.mock.calls[0];
    expect(filter.orderStatus.$in).not.toContain('SHIPPED'); // never touches orders on the road
    expect(update.$set).toEqual({ orderStatus: 'REJECTED', paymentStatus: 'CANCELLED' });
    expect(Inventory.updateOne).toHaveBeenCalledWith({ productId: p1, trackInventory: true }, { $inc: { quantity: 2 } }, { session: 'SESSION' });
    expect(Payment.updateMany).toHaveBeenCalledTimes(2);
    expect(Delivery.updateOne.mock.calls[0][1]).toEqual({ $set: { status: 'CANCELLED' } });
  });

  it('one failing order does not stop the others and is reported', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const good = { _id: oid(), items: [{ productId: oid(), quantity: 1 }] };
    const bad = { _id: oid(), items: [{ productId: oid(), quantity: 1 }] };
    terminateWorld({ orders: [bad, good] });
    Inventory.updateOne.mockRejectedValueOnce(new Error('boom'));

    const res = await term(cookie);

    expect(res.status).toBe(200);
    expect(res.body.rejectedOrders).toBe(1);
    expect(res.body.failedOrders).toEqual([{ orderId: String(bad._id), error: 'boom' }]);
  });

  it('is idempotent: re-running on a terminated brand only retries the order cleanup', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    terminateWorld({ alreadyTerminated: true, orders: [{ _id: oid(), items: [] }] });

    const res = await term(cookie);

    expect(res.status).toBe(200);
    expect(Store.updateMany).not.toHaveBeenCalled();
    expect(User.updateMany).not.toHaveBeenCalled();
    expect(res.body.rejectedOrders).toBe(1);
  });

  it('404 for an unknown brand', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    Brand.findOneAndUpdate.mockResolvedValue(null);
    Brand.findById.mockReturnValue(q(null));
    expect((await term(cookie)).status).toBe(404);
  });
});

describe('PATCH /api/v1/brands/:id/status and TERMINATED', () => {
  it('TERMINATED cannot be set through the status endpoint, and a terminated brand cannot be changed', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    const id = oid();
    let res = await request(app).patch(`/api/v1/brands/${id}/status`).set(...cookie).send({ status: 'TERMINATED' });
    expect(res.status).toBe(400);

    Brand.findById.mockResolvedValue({ _id: id, status: 'TERMINATED', save: jest.fn() });
    res = await request(app).patch(`/api/v1/brands/${id}/status`).set(...cookie).send({ status: 'ACTIVE' });
    expect(res.status).toBe(409);
  });
});
