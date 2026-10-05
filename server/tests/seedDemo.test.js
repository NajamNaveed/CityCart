const { buildDataset } = require('../scripts/demo/build');

const City = require('../src/models/city.model');
const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Inventory = require('../src/models/inventory.model');
const Employee = require('../src/models/employee.model');
const Cart = require('../src/models/cart.model');
const Order = require('../src/models/order.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const Review = require('../src/models/review.model');
const Notification = require('../src/models/notification.model');
const Counter = require('../src/models/counter.model');
const { ALL_PERMISSIONS } = require('../src/config/permissions');

const MODELS = {
  cities: City, users: User, brands: Brand, stores: Store, categories: Category, products: Product,
  inventories: Inventory, employees: Employee, carts: Cart, orders: Order, payments: Payment,
  deliveries: Delivery, reviews: Review, notifications: Notification, counters: Counter,
};

const NOW = new Date('2026-10-04T10:00:00Z');
const ds = buildDataset({ now: NOW, hashes: { admin: 'h1', brand: 'h2', demo: 'h3' } });
const id = (v) => String(v);
const unique = (list) => new Set(list).size === list.length;

// Every value found at a path, looking inside arrays and sub-documents.
function valuesAt(value, parts) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => valuesAt(v, parts));
  if (parts.length === 0) return [value];
  return valuesAt(value[parts[0]], parts.slice(1));
}

function schemaPaths(schema, prefix = '') {
  const out = [];
  for (const [path, type] of Object.entries(schema.paths)) {
    if (path === '_id' || path === '__v') continue;
    if (type.schema) out.push(...schemaPaths(type.schema, `${prefix}${path}.`));
    else out.push(`${prefix}${path}`);
  }
  return out;
}

describe('demo dataset', () => {
  it('is large enough to look like a real marketplace', () => {
    expect(ds.brands.length).toBeGreaterThanOrEqual(8);
    expect(ds.products.length).toBeGreaterThanOrEqual(50);
    expect(ds.orders.length).toBeGreaterThanOrEqual(40);
    expect(ds.reviews.length).toBeGreaterThanOrEqual(30);
  });

  describe.each(Object.entries(MODELS))('%s', (name, Model) => {
    it('passes the real schema validation and every field name is a real field', () => {
      for (const raw of ds[name]) {
        const doc = new Model(raw);
        const problem = doc.validateSync();
        expect(problem && problem.message).toBeUndefined();
        const stored = doc.toObject({ virtuals: false });
        for (const key of Object.keys(raw)) {
          expect({ name, key, kept: key in stored }).toEqual({ name, key, kept: true });
        }
      }
    });

    it('fills in every field of the model somewhere', () => {
      const missing = schemaPaths(Model.schema).filter(
        (path) => !ds[name].some((doc) => valuesAt(doc, path.split('.')).length > 0)
      );
      expect(missing).toEqual([]);
    });
  });

  it('has no duplicate unique values', () => {
    expect(unique(ds.users.map((u) => u.email))).toBe(true);
    expect(unique(ds.cities.map((c) => c.slug))).toBe(true);
    expect(unique(ds.brands.map((b) => b.slug))).toBe(true);
    expect(unique(ds.stores.map((s) => s.slug))).toBe(true);
    expect(unique(ds.stores.map((s) => id(s.brandId)))).toBe(true);
    expect(unique(ds.categories.map((c) => `${id(c.brandId)}/${c.slug}`))).toBe(true);
    expect(unique(ds.products.map((p) => `${id(p.brandId)}/${p.slug}`))).toBe(true);
    expect(unique(ds.products.map((p) => p.sku))).toBe(true);
    expect(unique(ds.inventories.map((i) => id(i.productId)))).toBe(true);
    expect(unique(ds.employees.map((e) => id(e.userId)))).toBe(true);
    expect(unique(ds.carts.map((c) => id(c.userId)))).toBe(true);
    expect(unique(ds.orders.map((o) => o.orderNumber))).toBe(true);
    expect(unique(ds.deliveries.map((d) => id(d.orderId)))).toBe(true);
  });

  it('has every reference pointing at something that exists', () => {
    const ids = (list) => new Set(list.map((d) => id(d._id)));
    const cities = ids(ds.cities);
    const users = ids(ds.users);
    const brands = ids(ds.brands);
    const categories = ids(ds.categories);
    const products = ids(ds.products);
    const orders = ids(ds.orders);
    const productById = new Map(ds.products.map((p) => [id(p._id), p]));

    ds.brands.forEach((b) => expect(cities.has(id(b.cityId))).toBe(true));
    ds.brands.filter((b) => b.terminatedBy).forEach((b) => expect(users.has(id(b.terminatedBy))).toBe(true));
    ds.stores.forEach((s) => expect(brands.has(id(s.brandId))).toBe(true));
    ds.categories.forEach((c) => {
      expect(brands.has(id(c.brandId))).toBe(true);
      if (c.parentId) expect(categories.has(id(c.parentId))).toBe(true);
    });
    ds.products.forEach((p) => {
      expect(brands.has(id(p.brandId))).toBe(true);
      const category = ds.categories.find((c) => id(c._id) === id(p.categoryId));
      expect(category && id(category.brandId)).toBe(id(p.brandId)); // a product only uses its own brand's categories
    });
    ds.inventories.forEach((i) => expect(id(productById.get(id(i.productId)).brandId)).toBe(id(i.brandId)));
    ds.employees.forEach((e) => {
      expect(users.has(id(e.userId))).toBe(true);
      expect(brands.has(id(e.brandId))).toBe(true);
      e.permissions.forEach((p) => expect(ALL_PERMISSIONS).toContain(p));
      e.permissionHistory.forEach((h) => expect(users.has(id(h.by))).toBe(true));
    });
    ds.carts.forEach((c) =>
      c.items.forEach((i) => expect(id(productById.get(id(i.productId)).brandId)).toBe(id(i.brandId)))
    );
    ds.orders.forEach((o) => {
      expect(users.has(id(o.customerId))).toBe(true);
      expect(brands.has(id(o.brandId))).toBe(true);
      o.items.forEach((i) => expect(id(productById.get(id(i.productId)).brandId)).toBe(id(o.brandId)));
      o.statusHistory.forEach((h) => expect(users.has(id(h.by))).toBe(true));
    });
    ds.payments.forEach((p) => expect(orders.has(id(p.orderId))).toBe(true));
    ds.deliveries.forEach((d) => expect(orders.has(id(d.orderId))).toBe(true));
    ds.reviews.forEach((r) => {
      expect(products.has(id(r.productId))).toBe(true);
      expect(orders.has(id(r.orderId))).toBe(true);
    });
    ds.notifications.forEach((n) => expect(users.has(id(n.userId))).toBe(true));
  });

  it('keeps brand accounts consistent: one owner each, staff matching their records', () => {
    ds.brands.forEach((b) => {
      expect(ds.users.filter((u) => u.role === 'BRAND_ADMIN' && id(u.brandId) === id(b._id))).toHaveLength(1);
    });
    ds.employees.forEach((e) => {
      const user = ds.users.find((u) => id(u._id) === id(e.userId));
      expect(user.role).toBe('BRAND_EMPLOYEE');
      expect(id(user.brandId)).toBe(id(e.brandId));
      expect(user.isActive).toBe(e.isActive);
    });
  });

  it('adds up: item totals, order totals, payments and refunds', () => {
    ds.orders.forEach((o) => {
      o.items.forEach((i) => expect(i.totalPrice).toBe(i.unitPrice * i.quantity));
      const subtotal = o.items.reduce((sum, i) => sum + i.totalPrice, 0);
      expect(o.subtotal).toBe(subtotal);
      expect(o.total).toBe(subtotal + o.deliveryFee - o.discount + o.tax);
      const payment = ds.payments.find((p) => id(p.orderId) === id(o._id));
      expect(payment.amount).toBe(o.total);
      expect(payment.status).toBe(o.paymentStatus);
      const refunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
      expect(payment.refundedAmount).toBe(refunded);
      expect(refunded).toBeLessThanOrEqual(payment.amount);
    });
  });

  it('tells a believable story over time: ordered, never in the future, ending on the current status', () => {
    ds.orders.forEach((o) => {
      expect(o.statusHistory[o.statusHistory.length - 1].status).toBe(o.orderStatus);
      expect(o.statusHistory[0].status).toBe('PENDING');
      for (let i = 1; i < o.statusHistory.length; i += 1) {
        expect(o.statusHistory[i].at >= o.statusHistory[i - 1].at).toBe(true);
      }
      expect(o.statusHistory.every((h) => h.at <= NOW)).toBe(true);
      expect(o.createdAt <= o.updatedAt).toBe(true);
    });
    for (const name of Object.keys(MODELS)) {
      ds[name].forEach((d) => {
        if (d.createdAt) expect(d.createdAt <= NOW).toBe(true);
        if (d.updatedAt) expect(d.updatedAt <= NOW).toBe(true);
      });
    }
  });

  it('only creates a delivery once an order is ready to ship, and its status agrees with the order', () => {
    const after = ['READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    ds.orders.forEach((o) => {
      const delivery = ds.deliveries.find((d) => id(d.orderId) === id(o._id));
      expect(Boolean(delivery)).toBe(after.includes(o.orderStatus));
      if (o.orderStatus === 'DELIVERED') expect(delivery.status).toBe('DELIVERED');
    });
  });

  it('only has reviews from customers whose order containing that product was delivered', () => {
    expect(unique(ds.reviews.map((r) => `${id(r.customerId)}/${id(r.productId)}`))).toBe(true);
    ds.reviews.forEach((r) => {
      const order = ds.orders.find((o) => id(o._id) === id(r.orderId));
      expect(order.orderStatus).toBe('DELIVERED');
      expect(id(order.customerId)).toBe(id(r.customerId));
      expect(order.items.some((i) => id(i.productId) === id(r.productId))).toBe(true);
    });
  });

  it('counts orders per year the way the app does', () => {
    ds.counters.forEach((c) => {
      const year = c._id.replace('order-', '');
      expect(ds.orders.filter((o) => o.orderNumber.startsWith(`CC-${year}-`))).toHaveLength(c.seq);
    });
  });

  it('shows every brand status, every order status that matters, and every notification type', () => {
    const present = (list) => new Set(list);
    expect(present(ds.brands.map((b) => b.status))).toEqual(present(['ACTIVE', 'PENDING', 'SUSPENDED', 'TERMINATED', 'REJECTED']));
    ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REJECTED'].forEach(
      (status) => expect(ds.orders.some((o) => o.orderStatus === status)).toBe(true)
    );
    ['PAID', 'PENDING', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].forEach((status) =>
      expect(ds.payments.some((p) => p.status === status)).toBe(true)
    );
    ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'READY_FOR_PICKUP'].forEach((status) =>
      expect(ds.deliveries.some((d) => d.status === status)).toBe(true)
    );
    ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'].forEach((status) => expect(ds.products.some((p) => p.status === status)).toBe(true));
    // PAYMENT_FAILED is left out on purpose: every order is cash on delivery, which cannot fail online.
    const types = new Set(ds.notifications.map((n) => n.type));
    const expected = Notification.schema.path('type').enumValues.filter((type) => type !== 'PAYMENT_FAILED');
    expect([...types].sort()).toEqual(expected.sort());
  });

  it('seeds the logins the guide promises', () => {
    const emails = ds.users.map((u) => u.email);
    ['admin@citycart.local', 'brand@citycart.local', 'sana.iqbal@citycart.demo', 'usman.tariq@citycart.demo'].forEach((email) =>
      expect(emails).toContain(email)
    );
  });
});