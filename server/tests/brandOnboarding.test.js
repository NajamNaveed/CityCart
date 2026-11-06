const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../src/models/user.model');
jest.mock('../src/models/employee.model');
jest.mock('../src/models/brand.model');
jest.mock('../src/models/store.model');
jest.mock('../src/models/branch.model');
jest.mock('../src/models/block.model');
jest.mock('../src/models/city.model');
jest.mock('../src/models/order.model');
jest.mock('../src/models/payment.model');
jest.mock('../src/models/delivery.model');
jest.mock('../src/models/inventory.model');
jest.mock('../src/utils/password', () => ({ hashPassword: jest.fn(), comparePassword: jest.fn() }));
jest.mock('../src/utils/transaction', () => ({ runInTransaction: (work) => work('SESSION') }));
jest.mock('../src/services/notification.service');
jest.mock('../src/services/branchBlocks.service', () => ({ blockIdsForPin: jest.fn() }));
// The provider is not under test here; the verification token itself is
// covered by emailAuth.test.js and the real-DB onboarding integration test.
jest.mock('../src/services/emailAuth.service', () => {
  class EmailAuthError extends Error {}
  return {
    sendVerificationEmail: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    EmailAuthError,
  };
});

const User = require('../src/models/user.model');
const Employee = require('../src/models/employee.model');
const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const Branch = require('../src/models/branch.model');
const Block = require('../src/models/block.model');
const City = require('../src/models/city.model');
const notifications = require('../src/services/notification.service');
const emailAuth = require('../src/services/emailAuth.service');
const { blockIdsForPin } = require('../src/services/branchBlocks.service');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const Inventory = require('../src/models/inventory.model');
const app = require('../src/app');
const { ROLES } = require('../src/config/roles');
const { getAuthCookie } = require('./helpers/testAuth');

const oid = () => new mongoose.Types.ObjectId();
const q = (v) => Object.assign(Promise.resolve(v), { session: () => Promise.resolve(v) });

let homeBlock;
const BLOCK_IDS = [oid()];

const application = () => ({
  owner: { name: 'Sara Owner', email: 'Sara@Shop.com', password: 'secret123', phone: '+923001234567' },
  brand: { name: 'Fresh Kicks', cityId: oid().toString(), description: 'Sneakers and sportswear.' },
  branch: { name: 'Fresh Kicks Main', blockId: String(homeBlock._id) },
});

function applyWorld() {
  const cityId = oid();
  homeBlock = { _id: oid(), cityId, isActive: true, center: { type: 'Point', coordinates: [73.08, 31.42] } };
  City.findOne.mockResolvedValue({ _id: cityId, isActive: true });
  Block.findOne.mockResolvedValue(homeBlock);
  User.findOne.mockResolvedValue(null);
  Brand.exists.mockResolvedValue(null);
  Brand.create.mockImplementation(async ([d]) => [{ ...d }]);
  User.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
  Store.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
  Branch.create.mockImplementation(async ([d]) => [{ _id: oid(), ...d }]);
}

function asRole(role) {
  const user = { _id: oid(), role, isActive: true, ...(role.includes('BRAND') && { brandId: oid() }) };
  User.findById.mockResolvedValue(user);
  return { cookie: ['Cookie', getAuthCookie(user)], user };
}

beforeEach(() => {
  jest.resetAllMocks();
  require('../src/utils/password').hashPassword.mockResolvedValue('HASHED');
  blockIdsForPin.mockResolvedValue(BLOCK_IDS);
  emailAuth.sendVerificationEmail.mockResolvedValue(true);
});

describe('POST /api/v1/brands/apply', () => {
  const post = (body) => request(app).post('/api/v1/brands/apply').send(body);

  const withChange = (fn) => {
    const a = application();
    fn(a);
    return a;
  };

  it.each([
    ['owner name missing', (a) => delete a.owner.name],
    ['owner phone missing', (a) => delete a.owner.phone],
    ['owner phone invalid', (a) => (a.owner.phone = 'abc')],
    ['weak password', (a) => (a.owner.password = '123')],
    ['bad email', (a) => (a.owner.email = 'nope')],
    ['brand name missing', (a) => delete a.brand.name],
    ['brand description too short', (a) => (a.brand.description = 'short')],
    ['invalid cityId', (a) => (a.brand.cityId = 'xyz')],
    ['shop name missing', (a) => delete a.branch.name],
    ['shop blockId missing', (a) => delete a.branch.blockId],
    ['shop blockId invalid', (a) => (a.branch.blockId = 'xyz')],
    ['shop address too long', (a) => (a.branch.address = 'x'.repeat(301))],
    ['shop phone invalid', (a) => (a.branch.phone = 'abc')],
    ['shop pin without longitude', (a) => (a.branch.latitude = 31.42)],
    ['shop latitude out of range', (a) => Object.assign(a.branch, { latitude: 95, longitude: 73.08 })],
    ['whole branch section missing', (a) => delete a.branch],
  ])('400 and nothing created when: %s', async (_n, mutate) => {
    applyWorld();
    const res = await post(withChange(mutate));
    expect(res.status).toBe(400);
    expect(Brand.create).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
    expect(Store.create).not.toHaveBeenCalled();
    expect(Branch.create).not.toHaveBeenCalled();
    expect(emailAuth.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('is public and creates brand (PENDING), owner (unverified), internal store and first shop together', async () => {
    applyWorld();
    const res = await post(application());

    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.message).toBe('Check your email to verify your account and publish your shop.');
    expect(res.body.brand).toMatchObject({ name: 'Fresh Kicks', slug: 'fresh-kicks', status: 'PENDING' });
    expect(res.body.branch).toMatchObject({ name: 'Fresh Kicks Main' });
    expect(res.body.user).toMatchObject({
      email: 'sara@shop.com',
      role: ROLES.BRAND_ADMIN,
      emailVerified: false,
    });

    const [[brandDoc], brandOpts] = Brand.create.mock.calls[0];
    const [[userDoc]] = User.create.mock.calls[0];
    const [[storeDoc]] = Store.create.mock.calls[0];
    const [[branchDoc]] = Branch.create.mock.calls[0];
    expect(brandDoc).toMatchObject({ name: 'Fresh Kicks', slug: 'fresh-kicks', status: 'PENDING' });
    expect(brandOpts).toEqual({ session: 'SESSION' });
    expect(userDoc).toMatchObject({
      role: ROLES.BRAND_ADMIN,
      accountType: 'BRAND',
      email: 'sara@shop.com',
      passwordHash: 'HASHED',
      emailVerifiedAt: null,
    });
    expect(String(userDoc.brandId)).toBe(String(brandDoc._id)); // owner is bound to the new brand
    // Customers never see this internal storefront record; it is named after the brand.
    expect(storeDoc).toMatchObject({ name: 'Fresh Kicks', slug: 'fresh-kicks' });
    expect(String(storeDoc.brandId)).toBe(String(brandDoc._id));
    expect(branchDoc).toMatchObject({
      name: 'Fresh Kicks Main',
      blockId: homeBlock._id,
      address: '',
      phone: '+923001234567', // falls back to the owner's phone
      location: homeBlock.center,
    });
    expect(branchDoc.blockIds).toEqual(BLOCK_IDS);
    expect(String(branchDoc.brandId)).toBe(String(brandDoc._id));
    expect(emailAuth.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(emailAuth.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'sara@shop.com', brandId: brandDoc._id })
    );
    // The brand is not announced until the owner verifies the inbox.
    expect(notifications.notifySuperAdminsOfNewBrand).not.toHaveBeenCalled();
    expect(notifications.notifyBrandOwnerWelcome).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toMatch(/HASHED|secret123|passwordHash/);
  });

  it('uses the shop phone and address when the owner gives them', async () => {
    applyWorld();
    const body = application();
    body.branch.phone = '+923009999999';
    body.branch.address = 'Shop 5, Main Boulevard';

    await post(body);

    const [[branchDoc]] = Branch.create.mock.calls[0];
    expect(branchDoc).toMatchObject({ phone: '+923009999999', address: 'Shop 5, Main Boulevard' });
  });

  it('places the first shop at the pin the owner taps on the map', async () => {
    applyWorld();
    const body = application();
    body.branch.latitude = 31.421;
    body.branch.longitude = 73.081;

    const res = await post(body);

    expect(res.status).toBe(201);
    const [[branchDoc]] = Branch.create.mock.calls[0];
    expect(branchDoc.location).toEqual({ type: 'Point', coordinates: [73.081, 31.421] });
    expect(blockIdsForPin).toHaveBeenCalledWith({ type: 'Point', coordinates: [73.081, 31.421] }, homeBlock);
  });

  it('400 when the tapped pin is outside the block outline', async () => {
    applyWorld();
    Block.findOne.mockResolvedValue({
      ...homeBlock,
      area: {
        type: 'Polygon',
        coordinates: [[[73.2, 31.5], [73.3, 31.5], [73.3, 31.6], [73.2, 31.6], [73.2, 31.5]]],
      },
    });
    const body = application();
    body.branch.latitude = 31.42;
    body.branch.longitude = 73.08;

    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/outside/i);
    expect(Brand.create).not.toHaveBeenCalled();
    expect(Branch.create).not.toHaveBeenCalled();
    expect(emailAuth.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('allows a brand account to use an email already registered as a customer', async () => {
    applyWorld();

    const res = await post(application());

    expect(res.status).toBe(201);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'sara@shop.com', accountType: 'BRAND' });
    expect(User.create.mock.calls[0][0][0]).toMatchObject({ accountType: 'BRAND', role: ROLES.BRAND_ADMIN });
  });

  it('status, role and brandId can never be set by the client', async () => {
    applyWorld();
    const body = application();
    body.brand.status = 'PENDING';
    body.owner.role = 'SUPER_ADMIN';
    body.owner.brandId = oid().toString();
    body.status = 'SUSPENDED';

    expect((await post(body)).status).toBe(201);
    expect(Brand.create.mock.calls[0][0][0].status).toBe('PENDING'); // only verification may activate it
    expect(User.create.mock.calls[0][0][0].role).toBe(ROLES.BRAND_ADMIN);
    expect(User.create.mock.calls[0][0][0].emailVerifiedAt).toBeNull();
  });

  it('400 when the city does not exist or is inactive (looked up as active only)', async () => {
    applyWorld();
    City.findOne.mockResolvedValue(null);
    const res = await post(application());
    expect(res.status).toBe(400);
    expect(City.findOne).toHaveBeenCalledWith({ _id: expect.any(String), isActive: true });
    expect(Block.findOne).not.toHaveBeenCalled();
    expect(Brand.create).not.toHaveBeenCalled();
  });

  it('400 when the shop block is unknown, inactive or in another city', async () => {
    applyWorld();
    Block.findOne.mockResolvedValue(null);
    let res = await post(application());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/blockId/i);
    expect(Block.findOne).toHaveBeenCalledWith({ _id: expect.any(String), isActive: true });
    expect(Brand.create).not.toHaveBeenCalled();

    applyWorld();
    Block.findOne.mockResolvedValue({ ...homeBlock, cityId: oid() });
    res = await post(application());
    expect(res.status).toBe(400);
    expect(Brand.create).not.toHaveBeenCalled();
  });

  it('409 for a taken email or brand name', async () => {
    applyWorld();
    User.findOne.mockResolvedValue({ _id: oid() });
    expect((await post(application())).status).toBe(409);

    applyWorld();
    Brand.exists.mockResolvedValue({ _id: oid() });
    const res = await post(application());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/brand/i);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('409 when a unique-index race is lost (E11000) and nothing is half-created', async () => {
    applyWorld();
    Store.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key collection: citycart.stores index: slug_1'), { code: 11000 }));
    const res = await post(application());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/name/i);
    expect(emailAuth.sendVerificationEmail).not.toHaveBeenCalled();
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

  it('400 for a too-short or missing name; a name with no letters is never available', async () => {
    expect((await request(app).get('/api/v1/brands/check-name')).status).toBe(400);
    const res = await request(app).get('/api/v1/brands/check-name?name=%21%21%21');
    expect(res.body.available).toBe(false);
    expect(Brand.exists).not.toHaveBeenCalled();
  });

  it('the dead store-name check has been removed', async () => {
    const res = await request(app).get('/api/v1/stores/check-name?name=Demo%20Store');
    expect(res.body.available).toBeUndefined();
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
    Brand.findOne.mockReturnValue(q(alreadyTerminated ? null : { _id: brandId, slug: 'fresh-kicks', status: 'ACTIVE' }));
    Brand.updateOne.mockResolvedValue({});
    Brand.findById.mockReturnValue(q({ _id: brandId, slug: 'fresh-kicks~terminated', status: 'TERMINATED' }));
    Store.updateMany.mockResolvedValue({});
    User.updateMany.mockResolvedValue({});
    Employee.updateMany.mockResolvedValue({});
    Employee.find.mockReturnValue({ select: () => q([]) });
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
    expect(Brand.updateOne).not.toHaveBeenCalled();
  });

  it('takes the brand offline atomically: status, store, every brand login and employee', async () => {
    const { cookie, user } = asRole(ROLES.SUPER_ADMIN);
    terminateWorld();

    const res = await term(cookie);

    expect(res.status).toBe(200);
    expect(Brand.updateOne).toHaveBeenCalledWith(
      { _id: brandId },
      {
        $set: {
          status: 'TERMINATED',
          terminationReason: 'Selling counterfeit goods',
          terminatedAt: expect.any(Date),
          terminatedBy: user._id,
          accessEndsAt: expect.any(Date),
          // archived brands keep their row but release the name/slug
          slug: `fresh-kicks~terminated~${brandId}`,
        },
      },
      { session: 'SESSION' }
    );
    expect(Store.updateMany).toHaveBeenCalledWith({ brandId: brandId.toString() }, { $set: { isActive: false } }, { session: 'SESSION' });
    expect(User.updateMany).toHaveBeenCalledWith(
      { brandId: brandId.toString(), role: { $in: [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.PICKER, ROLES.RIDER] } },
      // staff are NOT deactivated: time-limited, read-only access instead
      { $set: { accessExpiresAt: expect.any(Date), accessRestricted: true } },
      { session: 'SESSION' }
    );
    expect(Employee.updateMany).not.toHaveBeenCalled();
  });

  it('does not restrict a multi-brand employee who still works elsewhere', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    terminateWorld();
    const keep = oid();
    const members = { select: () => q([{ userId: keep }]) };
    // Both queries see the shared employee; the second proves another brand
    // still employs them.
    Employee.find.mockReturnValueOnce(members).mockReturnValueOnce(members);

    await term(cookie);

    expect(User.updateMany).toHaveBeenCalledWith(
      {
        brandId: brandId.toString(),
        role: { $in: [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE, ROLES.PICKER, ROLES.RIDER] },
        _id: { $nin: [keep] },
      },
      { $set: { accessExpiresAt: expect.any(Date), accessRestricted: true } },
      { session: 'SESSION' }
    );
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
    expect(Brand.updateOne).not.toHaveBeenCalled();
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
    expect(Brand.updateOne).not.toHaveBeenCalled();
    expect(Store.updateMany).not.toHaveBeenCalled();
    expect(User.updateMany).not.toHaveBeenCalled();
    expect(res.body.rejectedOrders).toBe(1);
  });

  it('404 for an unknown brand', async () => {
    const { cookie } = asRole(ROLES.SUPER_ADMIN);
    Brand.findOne.mockReturnValue(q(null));
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
