const http = require('http');
const mongoose = require('mongoose');
const { io: Client } = require('socket.io-client');

const { connect, disconnect, clearAll } = require('./db');
const app = require('../../src/app');
const { initSockets, closeSockets } = require('../../src/sockets');
const User = require('../../src/models/user.model');
const Brand = require('../../src/models/brand.model');
const Employee = require('../../src/models/employee.model');
const Product = require('../../src/models/product.model');
const Inventory = require('../../src/models/inventory.model');
const Cart = require('../../src/models/cart.model');
const Notification = require('../../src/models/notification.model');
const { hashPassword } = require('../../src/utils/password');
const { signToken } = require('../../src/utils/jwt');
const { AUTH_COOKIE_NAME } = require('../../src/config/cookie');
const { checkout } = require('../../src/services/order.service');
const {
  brandStaffIds,
  notify,
  listMyNotifications,
  markMyNotificationRead,
  markAllMyNotificationsRead,
  deleteMyNotification,
} = require('../../src/services/notification.service');

let n = 0;
const oid = () => new mongoose.Types.ObjectId();

let server;
let baseUrl;

beforeAll(async () => {
  await connect();
  await Promise.all([User, Brand, Employee, Product, Inventory, Notification].map((m) => m.init()));
  // The app and the socket layer share one HTTP server, exactly like src/server.js.
  server = http.createServer(app);
  initSockets(server);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await closeSockets();
  await new Promise((resolve) => server.close(resolve));
  await disconnect();
});
beforeEach(clearAll);

const makeUser = async ({ role = 'CUSTOMER', brandId } = {}) => {
  n += 1;
  return User.create({
    name: `User${n}`,
    email: `u${n}@x.com`,
    passwordHash: await hashPassword('secret123'),
    role,
    ...(brandId && { brandId }),
  });
};

const makeBrandWithStaff = async () => {
  n += 1;
  const brand = await Brand.create({ name: `Brand${n}`, slug: `brand${n}`, cityId: oid(), status: 'ACTIVE' });
  const owner = await makeUser({ role: 'BRAND_ADMIN', brandId: brand._id });
  const clerk = await makeUser({ role: 'BRAND_EMPLOYEE', brandId: brand._id });
  await Employee.create({ userId: clerk._id, brandId: brand._id, permissions: ['orders.view'], jobTitle: 'Clerk' });
  const packer = await makeUser({ role: 'BRAND_EMPLOYEE', brandId: brand._id });
  await Employee.create({ userId: packer._id, brandId: brand._id, permissions: ['products.view'], jobTitle: 'Packer' });
  return { brand, owner, clerk, packer };
};

const cookieFor = (user) =>
  `${AUTH_COOKIE_NAME}=${signToken({ userId: user._id, role: user.role, brandId: user.brandId })}`;

// reconnection: false so a failed attempt surfaces as connect_error instead
// of retrying silently forever (which would hang the test until its timeout).
const socketFor = (user) =>
  Client(baseUrl, {
    extraHeaders: { Cookie: cookieFor(user) },
    transports: ['websocket'],
    reconnection: false,
  });

const waitConnect = (socket, timeout = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket never connected')), timeout);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(err.message));
    });
  });

const waitForNotification = (socket, timeout = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no notification arrived')), timeout);
    socket.once('notification', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const expectNoNotification = (socket, ms = 400) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    socket.once('notification', () => {
      clearTimeout(timer);
      reject(new Error('received an unexpected notification'));
    });
  });

describe('personal inbox over REST (real MongoDB)', () => {
  it('lists and paginates only the caller’s notifications, with an unread count', async () => {
    const customer = await makeUser();
    const stranger = await makeUser();
    await notify({ userIds: [customer._id, stranger._id], type: 'ORDER_CONFIRMED', title: 'T', message: 'M' });
    await notify({ userIds: [customer._id], type: 'ORDER_SHIPPED', title: 'T2', message: 'M2' });

    const res = await listMyNotifications(customer._id, { page: 1, limit: 10 });

    expect(res.notifications).toHaveLength(2);
    expect(res.pagination).toMatchObject({ page: 1, limit: 10, total: 2, pages: 1 });
    expect(res.unreadCount).toBe(2);
    for (const item of res.notifications) {
      expect(String(item.userId)).toBe(String(customer._id));
    }
  });

  it('marks one read (isRead + readAt), then all, driving the unread count to zero', async () => {
    const customer = await makeUser();
    const [first] = await notify({ userIds: [customer._id], type: 'LOW_STOCK', title: 'T', message: 'M' });
    await notify({ userIds: [customer._id], type: 'ORDER_CONFIRMED', title: 'T2', message: 'M2' });

    const marked = await markMyNotificationRead(customer._id, first._id);
    expect(marked.isRead).toBe(true);
    expect(marked.readAt).toBeInstanceOf(Date);

    // read-all only touches the still-unread ones.
    const { updated } = await markAllMyNotificationsRead(customer._id);
    expect(updated).toBe(1);

    const after = await listMyNotifications(customer._id, {});
    expect(after.unreadCount).toBe(0);
    expect(after.notifications.every((x) => x.isRead && x.readAt)).toBe(true);
  });

  it('refuses to read, mark or delete another user’s notification (404, no leak)', async () => {
    const customer = await makeUser();
    const stranger = await makeUser();
    const [theirs] = await notify({ userIds: [stranger._id], type: 'ORDER_CREATED', title: 'T', message: 'M' });

    await expect(markMyNotificationRead(customer._id, theirs._id)).resolves.toBeNull();
    await expect(deleteMyNotification(customer._id, theirs._id)).resolves.toBeNull();

    const untouched = await Notification.findById(theirs._id);
    expect(untouched.isRead).toBe(false);

    // Deleting your own works and never touches the stranger's copy.
    const [mine] = await notify({ userIds: [customer._id], type: 'ORDER_CREATED', title: 'T', message: 'M' });
    const removed = await deleteMyNotification(customer._id, mine._id);
    expect(String(removed._id)).toBe(String(mine._id));
    expect(await Notification.findById(theirs._id)).not.toBeNull();
  });
});

describe('brand audience resolution (real User/Employee collections)', () => {
  it('returns the admin plus only the employees holding a required permission', async () => {
    const { brand, owner, clerk, packer } = await makeBrandWithStaff();

    const orderViewers = await brandStaffIds(brand._id, { anyOf: ['orders.view'] });
    expect(orderViewers.map(String).sort()).toEqual([String(owner._id), String(clerk._id)].sort());

    const productViewers = await brandStaffIds(brand._id, { anyOf: ['products.view'] });
    expect(productViewers.map(String).sort()).toEqual([String(owner._id), String(packer._id)].sort());

    const everyone = await brandStaffIds(brand._id);
    expect(everyone).toHaveLength(3);
  });

  it('excludes inactive employees and staff of other brands entirely', async () => {
    const { brand, owner, clerk } = await makeBrandWithStaff();
    const { brand: brandB, owner: ownerB, clerk: clerkB, packer: packerB } = await makeBrandWithStaff();
    await Employee.updateOne({ userId: clerk._id }, { $set: { isActive: false } });

    const ids = await brandStaffIds(brand._id, { anyOf: ['orders.view'] });
    expect(ids.map(String)).toEqual([String(owner._id)]);
    expect(ids).not.toContain(String(ownerB._id));

    // No permission requirement: every active staff member of THIS brand.
    const brandBIds = await brandStaffIds(brandB._id);
    expect(brandBIds.map(String).sort()).toEqual(
      [String(ownerB._id), String(clerkB._id), String(packerB._id)].sort()
    );
  });
});

describe('business events persist notifications (docs/12 §5-§6)', () => {
  it('a checkout notifies each brand’s order viewers, and a stock-out alerts inventory staff', async () => {
    const { brand, owner, clerk, packer } = await makeBrandWithStaff();
    const customer = await makeUser();

    const product = await Product.create({
      brandId: brand._id,
      categoryId: oid(),
      name: 'Lawn Suit',
      slug: `lawn-suit-${n}`,
      sku: `SKU-${n}`,
      price: 500,
      status: 'ACTIVE',
      isActive: true,
    });
    await Inventory.create({
      productId: product._id,
      brandId: brand._id,
      quantity: 2,
      lowStockThreshold: 5, // buying both remaining units goes straight to OUT_OF_STOCK
      trackInventory: true,
    });
    await Cart.create({ userId: customer._id, items: [{ productId: product._id, brandId: brand._id, quantity: 2 }] });

    const orders = await checkout(customer._id, {
      shippingAddress: { fullName: 'A B', phone: '+923001234567', addressLine: 'St 1', city: 'Lahore' },
      paymentMethod: 'COD',
    });
    expect(orders).toHaveLength(1);

    const ownerNotes = await Notification.find({ userId: owner._id }).lean();
    const clerkNotes = await Notification.find({ userId: clerk._id }).lean();
    const packerNotes = await Notification.find({ userId: packer._id }).lean();
    const customerNotes = await Notification.find({ userId: customer._id }).lean();

    // Order viewers (admin + orders.view employee) hear about the new order.
    expect(ownerNotes.map((x) => x.type).sort()).toEqual(['ORDER_CREATED', 'OUT_OF_STOCK'].sort());
    expect(clerkNotes.map((x) => x.type)).toEqual(['ORDER_CREATED']);
    // A products.view-only employee and the customer get no brand alerts.
    expect(packerNotes).toHaveLength(0);
    expect(customerNotes).toHaveLength(0);

    const created = ownerNotes.find((x) => x.type === 'ORDER_CREATED');
    expect(created.data).toMatchObject({ orderId: String(orders[0]._id), brandId: String(brand._id) });
    const stockOut = ownerNotes.find((x) => x.type === 'OUT_OF_STOCK');
    expect(stockOut.data).toMatchObject({ productId: String(product._id) });
  });
});

describe('Socket.IO real-time delivery (docs/12 §13-§14)', () => {
  it('pushes a persisted notification to the recipient only', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    const aliceSocket = socketFor(alice);
    const bobSocket = socketFor(bob);
    try {
      await waitConnect(aliceSocket);
      await waitConnect(bobSocket);

      const [record] = await notify({ userIds: [alice._id], type: 'ORDER_DELIVERED', title: 'Order delivered', message: 'Order CC-2026-000001 has been delivered.' });

      const payload = await waitForNotification(aliceSocket);
      expect(payload).toMatchObject({
        type: 'ORDER_DELIVERED',
        title: 'Order delivered',
        message: 'Order CC-2026-000001 has been delivered.',
        isRead: false,
      });
      expect(String(payload._id)).toBe(String(record._id));

      // Brand isolation, socket edition: the unrelated user hears nothing.
      await expect(expectNoNotification(bobSocket)).resolves.toBeUndefined();
    } finally {
      aliceSocket.close();
      bobSocket.close();
    }
  });

  it('rejects unauthenticated, forged-token and deactivated-user handshakes', async () => {
    // Polling transport: a middleware rejection is answered with a clean 401
    // carrying the middleware's message (the websocket path just drops the
    // upgrade, which no client-side error surfaces reliably).
    const rejecting = (opts) => Client(baseUrl, { transports: ['polling'], reconnection: false, ...opts });

    const anonymous = rejecting({});
    const forged = rejecting({ extraHeaders: { Cookie: `${AUTH_COOKIE_NAME}=not.a.jwt` } });
    try {
      await expect(waitConnect(anonymous)).rejects.toThrow('Unauthorized');
      await expect(waitConnect(forged)).rejects.toThrow('Unauthorized');
    } finally {
      anonymous.close();
      forged.close();
    }

    const deactivated = await makeUser();
    await User.updateOne({ _id: deactivated._id }, { $set: { isActive: false } });
    const stale = rejecting({ extraHeaders: { Cookie: cookieFor(deactivated) } });
    try {
      await expect(waitConnect(stale)).rejects.toThrow('Unauthorized');
    } finally {
      stale.close();
    }
  }, 20000);

  it('offline users still find the notification afterwards (persistence first)', async () => {
    const customer = await makeUser();
    await notify({ userIds: [customer._id], type: 'REFUND_ISSUED', title: 'Refund issued', message: 'PKR 50 refunded.' });

    // The user connects only NOW — after the event they missed.
    const lateSocket = socketFor(customer);
    try {
      await waitConnect(lateSocket);
      const res = await listMyNotifications(customer._id, {});
      expect(res.notifications.map((x) => x.type)).toEqual(['REFUND_ISSUED']);
      expect(res.unreadCount).toBe(1);
    } finally {
      lateSocket.close();
    }
  });
});
