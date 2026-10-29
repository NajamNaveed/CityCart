const { buildDataset } = require('../scripts/demo/build');

const City = require('../src/models/city.model');
const Block = require('../src/models/block.model');
const Branch = require('../src/models/branch.model');
const Conversation = require('../src/models/conversation.model');
const Message = require('../src/models/message.model');
const User = require('../src/models/user.model');
const Brand = require('../src/models/brand.model');
const Store = require('../src/models/store.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Inventory = require('../src/models/inventory.model');
const Employee = require('../src/models/employee.model');
const Cart = require('../src/models/cart.model');
const Order = require('../src/models/order.model');
const OrderAdjustment = require('../src/models/orderAdjustment.model');
const InventoryMovement = require('../src/models/inventoryMovement.model');
const Payment = require('../src/models/payment.model');
const Delivery = require('../src/models/delivery.model');
const Review = require('../src/models/review.model');
const Receipt = require('../src/models/receipt.model');
const Notification = require('../src/models/notification.model');
const Counter = require('../src/models/counter.model');
const { ALL_PERMISSIONS } = require('../src/config/permissions');

const MODELS = {
  cities: City, blocks: Block, branches: Branch, conversations: Conversation, messages: Message, users: User, brands: Brand, stores: Store, categories: Category, products: Product,
  inventories: Inventory, employees: Employee, carts: Cart, orders: Order, orderAdjustments: OrderAdjustment, inventoryMovements: InventoryMovement, payments: Payment, receipts: Receipt,
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

  it('is a Faisalabad-only marketplace with blocks, branches and per-branch catalogues', () => {
    expect(ds.cities.map((c) => c.name)).toEqual(['Faisalabad']);
    ds.brands.forEach((b) => expect(id(b.cityId)).toBe(id(ds.cities[0]._id)));
    ds.stores.forEach((st) => expect(st.address.city).toBe('Faisalabad'));
    ds.users.filter((u) => u.role === 'CUSTOMER').forEach((u) => expect(u.phone).toMatch(/^\+92 3/));

    const blockById = new Map(ds.blocks.map((b) => [id(b._id), b]));
    const branchById = new Map(ds.branches.map((b) => [id(b._id), b]));
    expect(ds.blocks.length).toBeGreaterThanOrEqual(8);
    expect(unique(ds.blocks.map((b) => b.slug))).toBe(true);
    expect(ds.branches.length).toBeGreaterThanOrEqual(20);

    ds.blocks.forEach((b) => expect(id(b.cityId)).toBe(id(ds.cities[0]._id)));
    ds.branches.forEach((br) => {
      expect(blockById.has(id(br.blockId))).toBe(true);
      expect(ds.brands.some((b) => id(b._id) === id(br.brandId))).toBe(true);
      // a pin sits close to its block centre (the API rejects anything over 25 km)
      const [lng, lat] = br.location.coordinates;
      const [cLng, cLat] = blockById.get(id(br.blockId)).center.coordinates;
      expect(Math.abs(lat - cLat)).toBeLessThan(0.02);
      expect(Math.abs(lng - cLng)).toBeLessThan(0.02);
    });
    // a brand with several branches has them in different blocks of one city
    const blocksByBrand = new Map();
    ds.branches.forEach((br) => blocksByBrand.set(id(br.brandId), [...(blocksByBrand.get(id(br.brandId)) || []), id(br.blockId)]));
    blocksByBrand.forEach((list) => expect(unique(list)).toBe(true));

    // a product's branch list only names branches of its own brand, and some products are branch-specific
    ds.products.forEach((p) =>
      p.branchIds.forEach((bid) => expect(id(branchById.get(id(bid)).brandId)).toBe(id(p.brandId)))
    );
    expect(ds.products.some((p) => p.branchIds.length > 0)).toBe(true);
    expect(ds.products.some((p) => p.branchIds.length === 0)).toBe(true);
    // every brand that has branches keeps at least one active branch for each of its active products
    ds.products.filter((p) => p.status === 'ACTIVE').forEach((p) => {
      const brandBranches = ds.branches.filter((br) => id(br.brandId) === id(p.brandId));
      if (brandBranches.length === 0) return;
      const carriers = p.branchIds.length ? brandBranches.filter((br) => p.branchIds.some((x) => id(x) === id(br._id))) : brandBranches;
      expect(carriers.length).toBeGreaterThan(0);
    });
    // mix of open and closed branches
    expect(ds.branches.some((br) => br.isActive)).toBe(true);
    expect(ds.branches.some((br) => !br.isActive)).toBe(true);
  });

  it('has believable customer conversations that respect who may talk to whom', () => {
    const userById = new Map(ds.users.map((u) => [id(u._id), u]));
    const convById = new Map(ds.conversations.map((c) => [id(c._id), c]));
    expect(ds.conversations.length).toBeGreaterThanOrEqual(8);
    // one thread per customer and brand
    expect(unique(ds.conversations.map((c) => `${id(c.customerId)}:${id(c.brandId)}`))).toBe(true);

    ds.conversations.forEach((c) => {
      expect(userById.get(id(c.customerId)).role).toBe('CUSTOMER');
      const brand = ds.brands.find((b) => id(b._id) === id(c.brandId));
      expect(brand.status).toBe('ACTIVE'); // only active brands take messages
      const msgs = ds.messages.filter((m) => id(m.conversationId) === id(c._id)).sort((a, b) => a.createdAt - b.createdAt);
      expect(msgs.length).toBeGreaterThan(0);
      expect(msgs[0].senderRole).toBe('CUSTOMER'); // the customer always writes first
      expect(c.lastMessageAt.getTime()).toBe(msgs[msgs.length - 1].createdAt.getTime());
      expect(c.lastMessagePreview).toBe(msgs[msgs.length - 1].body.slice(0, 100));
      // unread is only ever held by the side that did not write last
      if (c.lastSenderRole === 'CUSTOMER') expect(c.customerUnread).toBe(0);
      else expect(c.brandUnread).toBe(0);
    });

    ds.messages.forEach((m) => {
      expect(convById.has(id(m.conversationId))).toBe(true);
      const conv = convById.get(id(m.conversationId));
      const sender = userById.get(id(m.senderId));
      if (m.senderRole === 'CUSTOMER') expect(id(sender._id)).toBe(id(conv.customerId));
      else {
        // brand replies come from the brand's own owner, or a team member allowed to reply
        expect(id(sender.brandId)).toBe(id(conv.brandId));
        if (sender.role === 'BRAND_EMPLOYEE') {
          const emp = ds.employees.find((e) => id(e.userId) === id(sender._id));
          expect(emp.isActive && emp.permissions.includes('messages.manage')).toBe(true);
        }
      }
      expect(m.body.length).toBeLessThanOrEqual(1000);
      if (m.productId) {
        const product = ds.products.find((p) => id(p._id) === id(m.productId));
        expect(id(product.brandId)).toBe(id(conv.brandId)); // a product of the same brand
      }
    });
    // message ids sort in time order, which the API's paging relies on
    const sorted = [...ds.messages].sort((a, b) => a.createdAt - b.createdAt);
    sorted.slice(1).forEach((m, i) => expect(String(m._id) >= String(sorted[i]._id)).toBe(true));
    // one long thread (more than one page of 30) and a mix of read and unread
    expect(ds.conversations.some((c) => ds.messages.filter((m) => id(m.conversationId) === id(c._id)).length > 30)).toBe(true);
    expect(ds.conversations.some((c) => c.customerUnread > 0)).toBe(true);
    expect(ds.conversations.some((c) => c.brandUnread > 0)).toBe(true);
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

  it('has a receipt for every paid payment and tracks who holds the cash', () => {
    const paid = ds.payments.filter((p) => p.paidAt);
    expect(ds.receipts).toHaveLength(paid.length);
    paid.forEach((p) => {
      const receipt = ds.receipts.find((r) => id(r.paymentId) === id(p._id));
      expect(receipt).toBeDefined();
      expect(receipt.amount).toBe(p.amount);
      expect(receipt.method).toBe(p.method);
      if (p.method === 'COD') {
        expect(id(receipt.collectedBy)).toBe(id(p.collectedBy));
        // cash was collected by someone of the same brand, and settling comes after collecting
        const collector = ds.users.find((u) => id(u._id) === id(p.collectedBy));
        expect(id(collector.brandId)).toBe(id(p.brandId));
        if (p.settledAt) expect(p.settledAt >= p.collectedAt).toBe(true);
        expect(Boolean(p.settledAt)).toBe(Boolean(p.settledBy));
      } else {
        // paid online: nobody collected cash, so there is nothing to settle and no collector
        ['collectedBy', 'collectedAt', 'settledAt', 'settledBy'].forEach((field) => expect(p[field]).toBeUndefined());
        expect(receipt.collectedBy).toBeUndefined();
      }
    });
    expect(unique(ds.receipts.map((r) => r.receiptNumber))).toBe(true);
    // some cash is still with its collector, some has been handed over
    const cash = paid.filter((p) => p.method === 'COD');
    expect(cash.some((p) => p.settledAt)).toBe(true);
    expect(cash.some((p) => !p.settledAt)).toBe(true);
    // riders collect the cash of the deliveries given to them
    ds.deliveries.filter((d) => d.status === 'DELIVERED' && d.riderId).forEach((d) => {
      const p = ds.payments.find((x) => id(x.orderId) === id(d.orderId));
      if (p.method === 'COD') expect(id(p.collectedBy)).toBe(id(d.riderId));
    });
  });

  it('shows money paid at the door, with its proof state and receipts saying how it was paid', () => {
    const door = ds.payments.filter((p) => p.collection && p.collection.method !== 'CASH');
    expect(door.length).toBeGreaterThanOrEqual(3);
    expect(new Set(door.map((p) => p.collection.verification))).toEqual(new Set(['SUBMITTED', 'VERIFIED', 'REJECTED']));
    door.forEach((p) => {
      expect(p.method).not.toBe('COD');
      expect(p.collectedBy).toBeUndefined(); // non-cash money is never in a rider's hand
      expect(p.collection.reference).toMatch(/\S/);
      const receipt = ds.receipts.find((r) => id(r.paymentId) === id(p._id));
      expect(receipt.collectionMethod).toBe(p.collection.method);
      expect(receipt.collectedByName).toBeUndefined();
    });
    expect(door.some((p) => p.collection.wallet)).toBe(true);
    expect(door.some((p) => p.collection.duplicateReference && p.collection.duplicateProof)).toBe(true);
    expect(door.some((p) => p.collection.proofDeletedAt && !p.collection.proof)).toBe(true);
    expect(ds.notifications.some((n) => n.type === 'PAYMENT_PROOF_REJECTED')).toBe(true);
  });

  it('has orders paid online through the gateway, with their payment reference and stock-hold end', () => {
    const online = ds.payments.filter((p) => p.method === 'ONLINE_GATEWAY');
    expect(online.length).toBeGreaterThan(0);
    online.forEach((p) => {
      expect(p.status).toBe('PAID');
      expect(p.provider).toBe('mock');
      expect(p.transactionReference).toMatch(/^mock_[0-9a-f]{24}$/);
      expect(p.expiresAt).toBeInstanceOf(Date);
      expect(p.paidAt >= p.createdAt).toBe(true);
      const order = ds.orders.find((o) => id(o._id) === id(p.orderId));
      expect(order.paymentMethod).toBe('ONLINE_GATEWAY');
      expect(order.paymentStatus).toBe('PAID');
    });
  });

  it('counts orders per year the way the app does', () => {
    ds.counters.filter((c) => c._id.startsWith('order-')).forEach((c) => {
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