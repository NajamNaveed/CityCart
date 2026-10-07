const mongoose = require('mongoose');

const { connect, disconnect, clearAll } = require('./db');
const City = require('../../src/models/city.model');
const Brand = require('../../src/models/brand.model');
const Store = require('../../src/models/store.model');
const User = require('../../src/models/user.model');
const Employee = require('../../src/models/employee.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const Cart = require('../../src/models/cart.model');
const Order = require('../../src/models/order.model');
const Payment = require('../../src/models/payment.model');
const Delivery = require('../../src/models/delivery.model');
const Counter = require('../../src/models/counter.model');
const { applyForBrand, isBrandNameAvailable, isStoreNameAvailable } = require('../../src/services/brandOnboarding.service');
const { terminateBrand } = require('../../src/services/brandAdmin.service');
const { updateBrandStatus } = require('../../src/services/brand.service');
const { checkout } = require('../../src/services/order.service');
const { createEmployee } = require('../../src/services/employee.service');
const { ALL_PERMISSIONS } = require('../../src/config/permissions');
const { addItem } = require('../../src/services/cart.service');
const authenticate = require('../../src/middleware/authenticate');
const { signToken } = require('../../src/utils/jwt');
const { AUTH_COOKIE_NAME } = require('../../src/config/cookie');

// Runs the REAL authenticate middleware against the real database.
async function authAs(user, method, path) {
  const req = {
    method,
    originalUrl: path,
    cookies: { [AUTH_COOKIE_NAME]: signToken({ userId: user._id, role: user.role, brandId: user.brandId }) },
  };
  const out = { passed: false };
  const res = {
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; return this; },
  };
  await authenticate(req, res, () => { out.passed = true; });
  return out;
}
const HOUR = 3600 * 1000;

const oid = () => new mongoose.Types.ObjectId();
let n = 0;
const ok = (r) => r.filter((x) => x.status === 'fulfilled');

let city;
const application = (over = {}) => {
  n += 1;
  return {
    owner: { name: 'Owner', email: `owner${n}@shop.com`, password: 'secret123', phone: '+923001234567', ...over.owner },
    brand: { name: `Brand ${n}`, cityId: String(city._id), description: 'A fine brand with fine goods.', ...over.brand },
    store: {
      name: `Store ${n}`,
      address: { addressLine: 'Shop 1, Main Road', city: 'Faisalabad' },
      contact: { phone: '+923001234567' },
      ...over.store,
    },
  };
};

beforeAll(async () => {
  await connect();
  await Promise.all([City, Brand, Store, User, Employee, Product, Inventory, Cart, Order, Payment, Delivery, Counter].map((m) => m.init()));
});
afterAll(disconnect);
beforeEach(async () => {
  await clearAll();
  n += 1;
  city = await City.create({ name: `City${n}`, slug: `city${n}`, isActive: true });
});

describe('applyForBrand (real MongoDB)', () => {
  it('creates ACTIVE brand + BRAND_ADMIN owner + store together, instantly', async () => {
    const { brand, store, user } = await applyForBrand(application({ owner: { email: 'Sara@Shop.com' }, brand: { name: 'Fresh Kicks' }, store: { name: 'Fresh Kicks Store' } }));

    expect(brand).toMatchObject({ name: 'Fresh Kicks', slug: 'fresh-kicks', status: 'ACTIVE' });
    expect(store).toMatchObject({ slug: 'fresh-kicks-store', isActive: true });
    expect(String(store.brandId)).toBe(String(brand._id));
    expect(user.role).toBe('BRAND_ADMIN');
    expect(String(user.brandId)).toBe(String(brand._id));
    expect(user.email).toBe('sara@shop.com');
    const stored = await User.findById(user._id).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('ROLLS BACK everything if the store cannot be created (no orphan brand or login)', async () => {
    const spy = jest.spyOn(Store, 'create').mockRejectedValueOnce(new Error('store write failed'));
    await expect(applyForBrand(application())).rejects.toThrow('store write failed');
    spy.mockRestore();

    expect(await Brand.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
    expect(await Store.countDocuments()).toBe(0);
  });

  it('brand and store names are unique case-insensitively (and across punctuation)', async () => {
    await applyForBrand(application({ brand: { name: 'Fresh Kicks' }, store: { name: 'Kicks Corner' } }));

    await expect(applyForBrand(application({ brand: { name: 'FRESH KICKS' } }))).rejects.toMatchObject({ status: 409 });
    await expect(applyForBrand(application({ brand: { name: 'fresh-kicks!' } }))).rejects.toMatchObject({ status: 409 });
    await expect(applyForBrand(application({ store: { name: 'kicks corner' } }))).rejects.toMatchObject({ status: 409 });
    await expect(applyForBrand(application({ owner: { email: 'OWNER1@shop.com' } }))).resolves.toBeTruthy(); // unrelated
    expect(await Brand.countDocuments()).toBe(2);
  });

  it('the live name checks agree with what the application enforces', async () => {
    expect(await isBrandNameAvailable('Fresh Kicks')).toBe(true);
    await applyForBrand(application({ brand: { name: 'Fresh Kicks' }, store: { name: 'Fresh Store' } }));
    expect(await isBrandNameAvailable('FRESH KICKS')).toBe(false);
    expect(await isStoreNameAvailable('fresh store')).toBe(false);
    expect(await isStoreNameAvailable('Another Store')).toBe(true);
    expect(await isBrandNameAvailable('!!!')).toBe(false);
  });

  it('rejects an inactive or unknown city and a taken email', async () => {
    await City.updateOne({ _id: city._id }, { $set: { isActive: false } });
    await expect(applyForBrand(application())).rejects.toMatchObject({ status: 400 });

    await City.updateOne({ _id: city._id }, { $set: { isActive: true } });
    await applyForBrand(application({ owner: { email: 'same@shop.com' } }));
    await expect(applyForBrand(application({ owner: { email: 'same@shop.com' } }))).rejects.toMatchObject({ status: 409 });
  });

  it('6 concurrent applications for the SAME brand name: exactly one wins, no orphans', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => applyForBrand(application({ brand: { name: 'Race Brand' } })))
    );

    expect(ok(results)).toHaveLength(1);
    expect(await Brand.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
    expect(await Store.countDocuments()).toBe(1);
  });

  it('6 concurrent applications for the SAME store name: exactly one wins, no orphans', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => applyForBrand(application({ store: { name: 'Race Store' } })))
    );
    expect(ok(results)).toHaveLength(1);
    expect(await Brand.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
  });

  it('6 concurrent applications with the SAME email: exactly one wins', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => applyForBrand(application({ owner: { email: 'dup@shop.com' } })))
    );
    expect(ok(results)).toHaveLength(1);
    expect(await User.countDocuments({ email: 'dup@shop.com' })).toBe(1);
    expect(await Brand.countDocuments()).toBe(1);
  });
});

describe('terminateBrand (real MongoDB)', () => {
  const input = {
    shippingAddress: { fullName: 'John', phone: '+923001234567', addressLine: 'Street 1', city: 'Lahore', additionalInstructions: 'Gate 2, ring the bell.' },
    paymentMethod: 'COD',
  };

  // A live brand with one product (stock 20) and orders in various states.
  async function scenario() {
    const { brand, user: owner } = await applyForBrand(application());
    const employeeUser = await User.create({ name: 'Emp', email: `emp${++n}@x.com`, passwordHash: 'x', role: 'BRAND_EMPLOYEE', brandId: brand._id });
    await Employee.create({ userId: employeeUser._id, brandId: brand._id, permissions: ['orders.view'] });
    const product = await Product.create({
      brandId: brand._id, categoryId: oid(), name: `P${++n}`, slug: `p${n}`, sku: `S${n}`, price: 10, status: 'ACTIVE', isActive: true,
    });
    await Inventory.create({ productId: product._id, brandId: brand._id, quantity: 20 });

    const place = async (qty, status) => {
      const customer = oid();
      await Cart.create({ userId: customer, items: [{ productId: product._id, brandId: brand._id, quantity: qty }] });
      const [order] = await checkout(customer, input);
      if (status !== 'PENDING') await Order.updateOne({ _id: order._id }, { $set: { orderStatus: status } });
      if (status === 'READY_FOR_SHIPMENT') {
        await Delivery.create({ orderId: order._id, brandId: brand._id, customerId: customer, status: 'READY_FOR_PICKUP', address: { name: 'J', phone: '1', address: 'a' } });
      }
      return order;
    };
    const orders = {
      pending: await place(2, 'PENDING'),
      confirmed: await place(3, 'CONFIRMED'),
      ready: await place(4, 'READY_FOR_SHIPMENT'),
      shipped: await place(5, 'SHIPPED'),
    };
    return { brand, owner, employeeUser, product, orders };
  }

  const stockOf = async (p) => (await Inventory.findOne({ productId: p._id })).quantity;
  const statusOf = async (o) => (await Order.findById(o._id)).orderStatus;

  it('takes the brand fully offline and cleans up unshipped orders (restock, payments, delivery)', async () => {
    const { brand, owner, employeeUser, product, orders } = await scenario();
    expect(await stockOf(product)).toBe(6); // 20 - (2+3+4+5)
    const admin = oid();

    const result = await terminateBrand({ brandId: brand._id, reason: 'Selling counterfeit goods', adminId: admin });

    expect(result).toMatchObject({ rejectedOrders: 3, inTransitOrders: 1, failedOrders: [] });
    const stored = await Brand.findById(brand._id);
    expect(stored).toMatchObject({ status: 'TERMINATED', terminationReason: 'Selling counterfeit goods' });
    expect(String(stored.terminatedBy)).toBe(String(admin));
    expect((await Store.findOne({ brandId: brand._id })).isActive).toBe(false);
    // Staff keep a time-limited, read-only account (default 24h) — not an instant lock-out.
    for (const id of [owner._id, employeeUser._id]) {
      const staff = await User.findById(id);
      expect(staff).toMatchObject({ isActive: true, accessRestricted: true });
      expect(staff.accessExpiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * HOUR);
      expect(staff.accessExpiresAt.getTime()).toBeLessThan(Date.now() + 25 * HOUR);
    }
    expect(stored.accessEndsAt.getTime()).toBe((await User.findById(owner._id)).accessExpiresAt.getTime());
    expect((await Employee.findOne({ userId: employeeUser._id })).isActive).toBe(true);

    for (const key of ['pending', 'confirmed', 'ready']) {
      expect(await statusOf(orders[key])).toBe('REJECTED');
      expect((await Payment.findOne({ orderId: orders[key]._id })).status).toBe('CANCELLED');
    }
    expect((await Order.findById(orders.pending._id)).statusHistory.pop().status).toBe('REJECTED');
    expect((await Delivery.findOne({ orderId: orders.ready._id })).status).toBe('CANCELLED');
    expect(await stockOf(product)).toBe(15); // 6 + (2+3+4) restored; the SHIPPED 5 stay out
    expect(await statusOf(orders.shipped)).toBe('SHIPPED'); // untouched
    expect((await Payment.findOne({ orderId: orders.shipped._id })).status).toBe('PENDING');
  });

  it('staff can read and finish deliveries during the grace period, then are locked out (real authenticate)', async () => {
    const { brand, owner, employeeUser } = await scenario();
    await terminateBrand({ brandId: brand._id, reason: 'Selling counterfeit goods', adminId: oid(), graceHours: 2 });
    const fresh = (u) => User.findById(u._id);

    // during grace: reads and delivery-status writes pass; everything else is blocked
    let a = await authAs(await fresh(owner), 'GET', '/api/v1/brand/orders');
    expect(a.passed).toBe(true);
    a = await authAs(await fresh(employeeUser), 'PATCH', `/api/v1/deliveries/${oid()}/status`);
    expect(a.passed).toBe(true);
    a = await authAs(await fresh(owner), 'POST', '/api/v1/products');
    expect(a).toMatchObject({ passed: false, status: 403, body: { code: 'ACCOUNT_RESTRICTED' } });
    a = await authAs(await fresh(employeeUser), 'PATCH', `/api/v1/payments/${oid()}/status`);
    expect(a.status).toBe(403);

    // grace period over: everything is rejected
    await User.updateMany({ brandId: brand._id }, { $set: { accessExpiresAt: new Date(Date.now() - 1000) } });
    a = await authAs(await fresh(owner), 'GET', '/api/v1/brand/orders');
    expect(a).toMatchObject({ passed: false, status: 401, body: { code: 'ACCESS_EXPIRED' } });
    a = await authAs(await fresh(employeeUser), 'GET', '/api/v1/deliveries');
    expect(a.status).toBe(401);
  });

  it('graceHours 0 locks staff out immediately; other brands are never affected', async () => {
    const { brand, owner } = await scenario();
    const other = await scenario();
    await terminateBrand({ brandId: brand._id, reason: 'Severe fraud detected', adminId: oid(), graceHours: 0 });

    expect((await authAs(await User.findById(owner._id), 'GET', '/api/v1/brand/orders')).status).toBe(401);
    expect((await authAs(await User.findById(other.owner._id), 'GET', '/api/v1/brand/orders')).passed).toBe(true);
    expect((await authAs(await User.findById(other.owner._id), 'POST', '/api/v1/products')).passed).toBe(true); // not restricted
  });

  it('a terminated brand cannot add employees (they would bypass the grace rules)', async () => {
    const { brand } = await scenario();
    await terminateBrand({ brandId: brand._id, reason: 'Policy violation x', adminId: oid() });
    await expect(
      createEmployee({ brandId: brand._id, actorPermissions: ALL_PERMISSIONS, data: { name: 'New', email: `new${++n}@x.com`, password: 'secret123' } })
    ).rejects.toMatchObject({ status: 409, extra: { code: 'BRAND_TERMINATED' } });
    expect(await User.countDocuments({ email: /^new/ })).toBe(0);
  });

  it('is idempotent and safe under concurrency: stock is restored exactly once', async () => {
    const { brand, product } = await scenario();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => terminateBrand({ brandId: brand._id, reason: 'Policy violation x', adminId: oid() }))
    );

    expect(ok(results).length).toBeGreaterThan(0);
    expect(await stockOf(product)).toBe(15); // not 24, 33, ...
    expect(await Order.countDocuments({ brandId: brand._id, orderStatus: 'REJECTED' })).toBe(3);

    await terminateBrand({ brandId: brand._id, reason: 'Run again later', adminId: oid() });
    expect(await stockOf(product)).toBe(15);
  });

  it('a terminated brand can never be revived, and its products cannot be bought', async () => {
    const { brand, product } = await scenario();
    await terminateBrand({ brandId: brand._id, reason: 'Repeated violations', adminId: oid() });

    await expect(updateBrandStatus(brand._id, 'ACTIVE')).rejects.toMatchObject({ status: 409 });
    expect((await Brand.findById(brand._id)).status).toBe('TERMINATED');
    await expect(addItem(oid(), { productId: product._id, quantity: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it("does not touch another brand's orders, stock, store or logins", async () => {
    const { brand } = await scenario();
    const other = await scenario();
    await terminateBrand({ brandId: brand._id, reason: 'Violation of policy', adminId: oid() });

    expect((await Brand.findById(other.brand._id)).status).toBe('ACTIVE');
    expect((await Store.findOne({ brandId: other.brand._id })).isActive).toBe(true);
    expect((await User.findById(other.owner._id)).isActive).toBe(true);
    expect(await statusOf(other.orders.pending)).toBe('PENDING');
    expect(await stockOf(other.product)).toBe(6);
  });

  it('404 for an unknown brand', async () => {
    await expect(terminateBrand({ brandId: oid(), reason: 'No such brand here', adminId: oid() })).rejects.toMatchObject({ status: 404 });
  });
});
