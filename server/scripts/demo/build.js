/**
 * Turns ./catalog.js into database-ready documents. Pure: no database access, no clock reads
 * other than the `now` it is given, and a seeded random generator, so the same input always
 * produces the same shape of data. The runner (../seedDemo.js) inserts the result, and
 * tests/seedDemo.test.js validates it against the real Mongoose schemas.
 */
const mongoose = require('mongoose');

const { slugify } = require('../../src/utils/slugify');
const { CITIES, BRANDS, CUSTOMERS, ADMIN, CARTS, REMARKS } = require('./catalog');

const { ObjectId } = mongoose.Types;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// ── small helpers ────────────────────────────────────────────────────────────
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money = (n) => `PKR ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const pad = (n, width) => String(n).padStart(width, '0');

// Photo links. Default: picsum.photos (always available, but the photos are random and do not
// match the product). SEED_IMAGES=keyword switches to loremflickr.com, which picks photos by
// keyword (more relevant, but slower and less predictable).
function photo(keyword, n, width = 900, height = 1100) {
  if (process.env.SEED_IMAGES === 'keyword') {
    return `https://loremflickr.com/${width}/${height}/${keyword.replace(/\s+/g, '')}?lock=${n}`;
  }
  const seed = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `https://picsum.photos/seed/${seed}-${n}/${width}/${height}`;
}

const BACKGROUNDS = ['1e3a2f', 'b6472a', '231c16', '6f6256', '3b5b7c', '7a4b8c', '8a5a2b'];
function monogram(name, size = 256) {
  const bg = BACKGROUNDS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % BACKGROUNDS.length];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fdf5ed&size=${size}&bold=true&format=png`;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function businessHours({ open, close, closed }) {
  return Object.fromEntries(DAYS.map((day) => [day, closed.includes(day) ? 'Closed' : `${open} to ${close}`]));
}

// ── the builder ──────────────────────────────────────────────────────────────
function buildDataset({ now = new Date(), hashes }) {
  const random = makeRandom(20260501);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (min, max) => min + random() * (max - min);
  const intBetween = (min, max) => Math.floor(between(min, max + 1));
  const ago = (ms) => new Date(now.getTime() - ms);

  const ds = {
    cities: [], users: [], brands: [], stores: [], categories: [], products: [], inventories: [],
    employees: [], carts: [], orders: [], payments: [], deliveries: [], reviews: [], notifications: [], counters: [],
  };

  // ── cities ──
  const cityByKey = {};
  for (const c of CITIES) {
    const doc = {
      _id: new ObjectId(), name: c.name, slug: slugify(c.name), state: c.state, country: c.country,
      description: c.description, image: photo(`${c.name} city`, 1, 1200, 700), isActive: c.isActive,
      createdAt: ago(300 * DAY), updatedAt: ago(300 * DAY),
    };
    cityByKey[c.key] = doc;
    ds.cities.push(doc);
  }

  // ── users ──
  const userDoc = ({ name, email, phone, role, passwordHash, brandId, createdAt, isActive = true, restrictedUntil }) => ({
    _id: new ObjectId(), name, email, passwordHash, role, ...(brandId && { brandId }), phone,
    avatar: monogram(name, 240), isActive,
    ...(restrictedUntil && { accessRestricted: true, accessExpiresAt: restrictedUntil }),
    createdAt, updatedAt: createdAt,
  });

  const admin = userDoc({ ...ADMIN, role: 'SUPER_ADMIN', passwordHash: hashes.admin, createdAt: ago(320 * DAY) });
  ds.users.push(admin);

  const customers = CUSTOMERS.map((c, i) => {
    const doc = userDoc({
      name: c.name, email: c.email, phone: c.phone, role: 'CUSTOMER', passwordHash: hashes.demo,
      createdAt: ago((90 + (i * 17) % 190) * DAY), isActive: !c.inactive,
    });
    ds.users.push(doc);
    return { ...c, doc };
  });

  const shoppers = customers.filter((c) => c.doc.isActive); // deactivated accounts do not place new orders

  // ── brands, stores, categories, products, inventory, staff ──
  const brands = [];
  for (const b of BRANDS) {
    const createdAt = ago(b.ageDays * DAY);
    const brandId = new ObjectId();
    const terminatedAt = b.status === 'TERMINATED' ? ago(b.terminatedDaysAgo * DAY) : undefined;
    const accessEndsAt = terminatedAt ? new Date(terminatedAt.getTime() + b.graceHours * HOUR) : undefined;

    const brandDoc = {
      _id: brandId, name: b.name, slug: slugify(b.name), description: b.description,
      logo: monogram(b.name), coverImage: photo(`${b.key} cover`, 1, 1600, 600), cityId: cityByKey[b.city]._id,
      status: b.status, contact: b.contact, settings: b.settings, createdAt, updatedAt: createdAt,
      ...(terminatedAt && { terminationReason: b.terminationReason, terminatedAt, terminatedBy: admin._id, accessEndsAt }),
    };
    ds.brands.push(brandDoc);

    const restrictedUntil = accessEndsAt && accessEndsAt > now ? accessEndsAt : undefined;
    const owner = userDoc({
      name: b.owner.name, email: b.owner.email, phone: b.owner.phone, role: 'BRAND_ADMIN',
      passwordHash: hashes[b.owner.pw], brandId, createdAt, restrictedUntil,
    });
    ds.users.push(owner);

    const storeDoc = {
      _id: new ObjectId(), brandId, name: b.store.name, slug: slugify(b.store.name), description: b.store.description,
      address: b.store.address, contact: b.store.contact, businessHours: businessHours(b.store.hours),
      logo: monogram(b.store.name), banner: photo(`${b.key} store`, 2, 1600, 500), isActive: b.store.isActive,
      createdAt, updatedAt: createdAt,
    };
    ds.stores.push(storeDoc);

    const categoryByKey = {};
    for (const c of b.categories) {
      const doc = {
        _id: new ObjectId(), brandId, name: c.name, slug: slugify(c.name), description: c.description,
        image: photo(`${b.key} ${c.key}`, 3, 800, 600), parentId: c.parent ? categoryByKey[c.parent]._id : null,
        isActive: c.isActive !== false, createdAt: new Date(createdAt.getTime() + HOUR), updatedAt: new Date(createdAt.getTime() + HOUR),
      };
      categoryByKey[c.key] = doc;
      ds.categories.push(doc);
    }

    const products = b.products.map((p, i) => {
      const status = p.st || 'ACTIVE';
      const made = new Date(createdAt.getTime() + (2 + i) * DAY * (b.ageDays > 30 ? 1 : 0.1));
      const doc = {
        _id: new ObjectId(), brandId, categoryId: categoryByKey[p.c]._id, name: p.n, slug: slugify(p.n), description: p.d,
        images: [photo(p.kw, 1), photo(p.kw, 2), photo(p.kw, 3)], price: p.p,
        ...(p.cmp && { compareAtPrice: p.cmp }), sku: `${b.skuPrefix}-${pad(i + 1, 3)}`,
        isActive: status === 'ACTIVE' || status === 'DRAFT', status, attributes: p.a, createdAt: made, updatedAt: made,
      };
      ds.products.push(doc);
      ds.inventories.push({
        _id: new ObjectId(), brandId, productId: doc._id, quantity: p.s, reservedQuantity: 0,
        lowStockThreshold: p.low ?? 5, trackInventory: p.track !== false, createdAt: made, updatedAt: made,
      });
      return { ...doc, stock: p.s, low: p.low ?? 5, track: p.track !== false };
    });

    // Staff accounts and their permission trail.
    const staff = b.staff.map((s, i) => {
      const joined = new Date(createdAt.getTime() + (3 + i) * DAY);
      const user = userDoc({
        name: s.name, email: s.email, phone: s.phone, role: 'BRAND_EMPLOYEE', passwordHash: hashes.demo,
        brandId, createdAt: joined, isActive: s.isActive !== false, restrictedUntil,
      });
      ds.users.push(user);

      const final = [...s.permissions];
      const history = i % 2 === 0 || final.length < 3
        ? [{ by: owner._id, at: joined, added: final, removed: [] }]
        : [
            { by: owner._id, at: joined, added: [...final, 'customers.view'], removed: [] },
            { by: owner._id, at: new Date(joined.getTime() + 9 * DAY), added: [], removed: ['customers.view'] },
          ];
      const employee = {
        _id: new ObjectId(), userId: user._id, brandId, permissions: final, permissionHistory: history,
        jobTitle: s.jobTitle, isActive: s.isActive !== false, createdAt: joined, updatedAt: joined,
      };
      ds.employees.push(employee);
      return { user, employee, joined, changed: history.length > 1 };
    });

    brands.push({ def: b, doc: brandDoc, owner, store: storeDoc, categoryByKey, products, staff, terminatedAt });
  }
  const brandByKey = Object.fromEntries(brands.map((b) => [b.def.key, b]));

  // Who handles what inside a brand: an employee with the right permission, otherwise the owner.
  const handler = (brand, permission) => {
    const match = brand.staff.find((s) => s.employee.isActive && s.employee.permissions.includes(permission));
    return match ? match.user : brand.owner;
  };

  // ── open carts ──
  for (const [customerIndex, lines] of CARTS) {
    const customer = customers[customerIndex];
    ds.carts.push({
      _id: new ObjectId(), userId: customer.doc._id,
      items: lines.map(([brandKey, productName, quantity]) => {
        const brand = brandByKey[brandKey];
        const product = brand.products.find((p) => p.name === productName);
        if (!product) throw new Error(`Cart refers to an unknown product: ${productName}`);
        return { _id: new ObjectId(), productId: product._id, brandId: brand.doc._id, quantity };
      }),
      createdAt: ago(intBetween(1, 6) * DAY), updatedAt: ago(intBetween(1, 20) * HOUR),
    });
  }

  // ── orders, with their payments and deliveries ──
  const PLAN = {
    loom: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'CANCELLED', 'SHIPPED'],
    rangrez: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'PROCESSING', 'REJECTED'],
    mehr: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'OUT_FOR_DELIVERY', 'SHIPPED', 'CANCELLED'],
    sukoon: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'CONFIRMED', 'PENDING', 'READY_FOR_SHIPMENT', 'OUT_FOR_DELIVERY'],
    zaitoon: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'PROCESSING', 'SHIPPED', 'REJECTED'],
    naqsh: ['DELIVERED', 'DELIVERED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY'],
    gadgets: ['DELIVERED', 'DELIVERED'],
    quick: ['DELIVERED', 'DELIVERED', 'REJECTED', 'REJECTED'],
  };
  const CHAIN = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const LAST_EVENT_HOURS = {
    PENDING: [0.5, 30], CONFIRMED: [3, 50], PROCESSING: [5, 70], READY_FOR_SHIPMENT: [8, 80], SHIPPED: [20, 90],
    OUT_FOR_DELIVERY: [1, 8], DELIVERED: [24 * 12, 24 * 58], CANCELLED: [24 * 2, 24 * 25], REJECTED: [24 * 2, 24 * 25],
  };
  const COURIERS = { loom: 'TCS', rangrez: 'LEO', mehr: 'TCS', sukoon: 'TRAX', zaitoon: 'LEO', naqsh: 'TCS', gadgets: 'TRAX', quick: 'LEO' };
  const AGENTS = ['Shoaib (rider)', 'Naveed Akram (TCS)', 'Rizwan (Leopards)', 'Kamran Ali (Trax)', 'Adnan (company rider)', 'Mubashir (rider)'];
  const GIFT_NOTES = ['Gift: please remove the price slip.', 'Needed before the weekend if possible.', 'Please pack carefully, it is a gift.'];

  const orders = [];
  for (const [brandKey, statuses] of Object.entries(PLAN)) {
    const brand = brandByKey[brandKey];
    const sellable = brand.products.filter((p) => (brandKey === 'quick' ? true : p.status === 'ACTIVE'));

    statuses.forEach((status, indexInBrand) => {
      const customer = pick(shoppers);
      const orderHandler = handler(brand, 'orders.manage');
      const deliveryHandler = handler(brand, 'delivery.manage');

      // items
      const chosen = [];
      const wanted = Math.min(sellable.length, intBetween(1, 3));
      while (chosen.length < wanted) {
        const p = pick(sellable);
        if (!chosen.includes(p)) chosen.push(p);
      }
      const items = chosen.map((p) => {
        const quantity = brandKey === 'rangrez' && /per metre/.test(p.name) ? intBetween(3, 10) : intBetween(1, 3);
        return { _id: new ObjectId(), productId: p._id, productName: p.name, sku: p.sku, quantity, unitPrice: p.price, totalPrice: p.price * quantity, image: p.images[0] };
      });
      const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
      const freeAbove = brand.def.settings.freeDeliveryAbove;
      const deliveryFee = freeAbove && subtotal >= freeAbove ? 0 : 250;
      const discount = status === 'DELIVERED' && indexInBrand % 4 === 1 ? Math.round((subtotal * 0.1) / 10) * 10 : 0;
      const tax = brand.def.settings.taxRatePercent ? Math.round((subtotal * brand.def.settings.taxRatePercent) / 100) : 0;
      const total = subtotal + deliveryFee - discount + tax;
      const notes = discount > 0 ? 'Customer used the 10% Eid offer.' : indexInBrand % 5 === 3 ? pick(GIFT_NOTES) : undefined;

      // timeline: walk backwards from the last event so nothing lies in the future
      const path = status === 'CANCELLED' || status === 'REJECTED' ? ['PENDING', status] : CHAIN.slice(0, CHAIN.indexOf(status) + 1);
      let lastEvent;
      let events;
      if (brandKey === 'quick' && status === 'REJECTED') {
        const rejectedAt = new Date(brand.terminatedAt.getTime() + intBetween(5, 30) * 60 * 1000);
        events = [{ status: 'PENDING', at: new Date(brand.terminatedAt.getTime() - intBetween(20, 60) * HOUR) }, { status: 'REJECTED', at: rejectedAt }];
      } else {
        const [lo, hi] = brandKey === 'gadgets' || brandKey === 'quick' ? [24 * 35, 24 * 65] : LAST_EVENT_HOURS[status];
        lastEvent = ago(between(lo, hi) * HOUR);
        events = [];
        let cursor = lastEvent;
        for (let i = path.length - 1; i >= 0; i -= 1) {
          events.unshift({ status: path[i], at: cursor });
          cursor = new Date(cursor.getTime() - between(1, i >= path.length - 2 ? 40 : 18) * HOUR);
        }
      }
      const byFor = (s) => {
        if (s === 'PENDING' || (s === 'CANCELLED')) return customer.doc._id;
        if (brandKey === 'quick' && s === 'REJECTED') return admin._id;
        if (s === 'SHIPPED' || s === 'OUT_FOR_DELIVERY' || s === 'DELIVERED') return deliveryHandler._id;
        return orderHandler._id;
      };
      const statusHistory = events.map((e) => ({ status: e.status, by: byFor(e.status), at: e.at }));
      const createdAt = events[0].at;
      const finishedAt = events[events.length - 1].at;

      const flags = {
        fullRefund: brandKey === 'loom' && status === 'DELIVERED' && indexInBrand === 0,
        partRefund: brandKey === 'mehr' && status === 'DELIVERED' && indexInBrand === 1,
        failedDelivery: brandKey === 'mehr' && status === 'OUT_FOR_DELIVERY',
        inTransit: brandKey === 'mehr' && status === 'SHIPPED',
      };

      const order = {
        _id: new ObjectId(), orderNumber: '', customerId: customer.doc._id, brandId: brand.doc._id, items,
        shippingAddress: {
          name: customer.name, phone: customer.phone, address: customer.address, city: customer.city, state: customer.state,
          country: 'Pakistan', postalCode: customer.postalCode, ...(customer.note && { additionalInstructions: customer.note }),
        },
        subtotal, deliveryFee, discount, tax, total, paymentMethod: 'COD',
        paymentStatus: status === 'CANCELLED' || status === 'REJECTED' ? 'CANCELLED' : status === 'DELIVERED' ? 'PAID' : 'PENDING',
        currency: 'PKR', orderStatus: status, statusHistory, ...(notes && { notes }), createdAt, updatedAt: finishedAt,
      };
      if (flags.fullRefund) order.paymentStatus = 'REFUNDED';
      if (flags.partRefund) order.paymentStatus = 'PARTIALLY_REFUNDED';
      ds.orders.push(order);

      // payment
      const payment = {
        _id: new ObjectId(), orderId: order._id, customerId: customer.doc._id, amount: total, method: 'COD', status: order.paymentStatus,
        currency: 'PKR', createdAt, updatedAt: finishedAt, refundedAmount: 0, refunds: [],
      };
      if (status === 'DELIVERED') {
        Object.assign(payment, {
          paidAt: finishedAt, confirmedBy: deliveryHandler._id, provider: 'Cash on Delivery', transactionReference: `RCPT-${pad(ds.orders.length, 6)}`,
        });
      }
      if (flags.fullRefund || flags.partRefund) {
        const amount = flags.fullRefund ? total : Math.round(items[0].totalPrice / 2 / 10) * 10;
        const at = new Date(finishedAt.getTime() + 3 * DAY);
        payment.refundedAmount = amount;
        payment.refunds = [{
          amount, by: brand.owner._id, at,
          reason: flags.fullRefund ? 'The suit arrived with a printing fault. Full refund agreed with the customer.' : 'One item was returned because the size did not fit. Partial refund issued.',
        }];
        payment.updatedAt = at;
        order.updatedAt = at;
      }
      ds.payments.push(payment);

      // delivery
      const readyEvent = events.find((e) => e.status === 'READY_FOR_SHIPMENT');
      if (readyEvent) {
        const deliveryStatus = status === 'READY_FOR_SHIPMENT' ? 'READY_FOR_PICKUP'
          : status === 'SHIPPED' ? (flags.inTransit ? 'IN_TRANSIT' : 'PICKED_UP')
          : status === 'OUT_FOR_DELIVERY' ? (flags.failedDelivery ? 'FAILED' : 'OUT_FOR_DELIVERY') : 'DELIVERED';
        ds.deliveries.push({
          _id: new ObjectId(), orderId: order._id, brandId: brand.doc._id, customerId: customer.doc._id, status: deliveryStatus,
          address: { ...order.shippingAddress }, deliveryFee,
          ...(deliveryStatus !== 'READY_FOR_PICKUP' && {
            trackingReference: `${COURIERS[brandKey]}-${pad(Math.floor(random() * 1e10), 10)}`, assignedAgent: pick(AGENTS),
          }),
          ...(deliveryStatus === 'FAILED' && { failureReason: 'The customer\'s phone was switched off and nobody was at the address. The rider will try again tomorrow.' }),
          createdAt: readyEvent.at, updatedAt: finishedAt,
        });
      }
      orders.push({ order, payment, brand, customer, events, flags, orderHandler, deliveryHandler });
    });
  }

  // Order numbers run in order of creation, with one counter per year (as the app does).
  const perYear = {};
  [...orders].sort((a, b) => a.order.createdAt - b.order.createdAt).forEach(({ order }) => {
    const year = order.createdAt.getUTCFullYear();
    perYear[year] = (perYear[year] || 0) + 1;
    order.orderNumber = `CC-${year}-${pad(perYear[year], 6)}`;
  });
  for (const [year, seq] of Object.entries(perYear)) ds.counters.push({ _id: `order-${year}`, seq });

  // ── reviews, written by customers whose orders were delivered ──
  const OPENERS = {
    5: ['Absolutely love it.', 'Better than I hoped.', 'Very happy with this order.'],
    4: ['Really good overall.', 'Happy with this.', 'Good quality and good service.'],
    3: ['It is fine.', 'Decent for the price.', 'Mixed feelings.'],
    2: ['Not quite what I expected.', 'A bit disappointed.'],
    1: ['I am very disappointed.', 'Would not buy again.'],
  };
  const TITLES = {
    5: ['Beautiful quality', 'Exactly as pictured', 'Worth every rupee', 'Highly recommended', 'Will order again'],
    4: ['Very good', 'Lovely, one small niggle', 'Happy with it', 'Good value'],
    3: ['Okay for the price', 'Decent, not amazing', 'Average'],
    2: ['Not as expected', 'Could be better'],
    1: ['Disappointed', 'Not as described'],
  };
  const CLOSERS = {
    5: ['Delivery was quick too.', 'I would recommend this seller.', 'Already planning my next order.'],
    4: ['Delivery was on time.', 'I would order again.'],
    3: ['It does the job.', 'Delivery was fine.'],
    2: ['Hoping the next one is better.', 'Delivery was on time at least.'],
    1: ['I would think twice before ordering.', 'I have contacted the seller.'],
  };
  const seenReviews = new Set();
  for (const { order, brand, events } of orders) {
    if (order.orderStatus !== 'DELIVERED') continue;
    const delivered = events[events.length - 1].at;
    for (const item of order.items) {
      const key = `${order.customerId}-${item.productId}`;
      if (seenReviews.has(key) || random() > 0.82) continue;
      seenReviews.add(key);

      const roll = random();
      const rating = brand.def.key === 'quick' ? (roll < 0.5 ? 1 : roll < 0.8 ? 2 : 3)
        : roll < 0.5 ? 5 : roll < 0.8 ? 4 : roll < 0.9 ? 3 : roll < 0.96 ? 2 : 1;
      const remarks = REMARKS[brand.def.key] || REMARKS.quick;
      const remark = pick(rating >= 4 ? remarks.good : remarks.bad);
      const comment = `${pick(OPENERS[rating])} ${remark} ${pick(CLOSERS[rating])}`;
      const reviewedAt = new Date(Math.min(now.getTime() - HOUR, delivered.getTime() + between(1, 6) * DAY));

      ds.reviews.push({
        _id: new ObjectId(), customerId: order.customerId, productId: item.productId, brandId: order.brandId, orderId: order._id,
        rating, title: pick(TITLES[rating]), comment, isApproved: random() < 0.9, createdAt: reviewedAt, updatedAt: reviewedAt,
      });
    }
  }

  // ── notifications ──
  const note = (userId, type, title, message, data, at) => {
    const isRead = now - at > 3 * DAY;
    ds.notifications.push({
      _id: new ObjectId(), userId, type, title, message, data, isRead,
      // Read notifications also carry readAt (docs/12 §10), a moment after arrival.
      ...(isRead && { readAt: new Date(at.getTime() + 60 * 1000) }),
      createdAt: at,
    });
  };
  const brandReaders = (brand) => {
    const staff = brand.staff.find((s) => s.employee.isActive && s.employee.permissions.includes('orders.view'));
    return staff ? [brand.owner, staff.user] : [brand.owner];
  };

  for (const { order, payment, brand, customer, events } of orders) {
    const ref = { orderId: order._id, orderNumber: order.orderNumber, brandId: brand.doc._id };
    const units = order.items.reduce((n, i) => n + i.quantity, 0);
    for (const e of events) {
      const at = new Date(e.at.getTime() + 30 * 1000);
      switch (e.status) {
        case 'PENDING':
          brandReaders(brand).forEach((u) => note(u._id, 'ORDER_CREATED', `New order ${order.orderNumber}`, `${customer.name} ordered ${units} item${units === 1 ? '' : 's'} worth ${money(order.total)}. Confirm it to start preparing.`, ref, at));
          break;
        case 'CONFIRMED':
          note(customer.doc._id, 'ORDER_CONFIRMED', 'Your order is confirmed', `${brand.def.name} confirmed order ${order.orderNumber}. They will start preparing it now.`, ref, at);
          break;
        case 'PROCESSING':
          note(customer.doc._id, 'ORDER_PROCESSING', 'Your order is being prepared', `${brand.def.name} is packing order ${order.orderNumber}.`, ref, at);
          break;
        case 'SHIPPED':
          note(customer.doc._id, 'ORDER_SHIPPED', 'Your order has shipped', `Order ${order.orderNumber} is on its way from ${brand.def.name}.`, ref, at);
          break;
        case 'OUT_FOR_DELIVERY':
          note(customer.doc._id, 'ORDER_OUT_FOR_DELIVERY', 'Out for delivery today', `Order ${order.orderNumber} is out for delivery. Please keep ${money(order.total)} ready in cash.`, ref, at);
          break;
        case 'DELIVERED':
          note(customer.doc._id, 'ORDER_DELIVERED', 'Your order was delivered', `Order ${order.orderNumber} has been delivered. We hope you love it. You can now leave a review.`, ref, at);
          note(brand.owner._id, 'PAYMENT_RECEIVED', 'Cash payment received', `${money(order.total)} was collected on delivery for order ${order.orderNumber}.`, { ...ref, paymentId: payment._id }, at);
          break;
        case 'REJECTED':
          note(customer.doc._id, 'ORDER_REJECTED', 'Your order could not be fulfilled', `${brand.def.name} could not fulfil order ${order.orderNumber}. You have not been charged.`, ref, at);
          break;
        case 'CANCELLED':
          brandReaders(brand).forEach((u) => note(u._id, 'ORDER_CANCELLED', `Order ${order.orderNumber} was cancelled`, `${customer.name} cancelled the order before it was confirmed. Stock has been returned.`, ref, at));
          break;
        default:
      }
    }
    if (payment.refunds.length) {
      const refund = payment.refunds[0];
      note(customer.doc._id, 'REFUND_ISSUED', 'A refund was issued', `${brand.def.name} refunded ${money(refund.amount)} for order ${order.orderNumber}.`, { ...ref, paymentId: payment._id }, new Date(refund.at.getTime() + 60 * 1000));
    }
  }

  const productById = new Map(ds.products.map((p) => [String(p._id), p]));
  for (const inv of ds.inventories) {
    const brand = brands.find((b) => String(b.doc._id) === String(inv.brandId));
    const product = productById.get(String(inv.productId));
    if (!inv.trackInventory || product.status !== 'ACTIVE' || brand.doc.status !== 'ACTIVE') continue;
    if (inv.quantity === 0) {
      note(brand.owner._id, 'OUT_OF_STOCK', `${product.name} is out of stock`, 'Customers cannot order it until you add stock.', { productId: product._id, brandId: brand.doc._id }, ago(between(4, 40) * HOUR));
    } else if (inv.quantity <= inv.lowStockThreshold) {
      note(brand.owner._id, 'LOW_STOCK', `Low stock: ${product.name}`, `Only ${inv.quantity} left, and your warning level is ${inv.lowStockThreshold}.`, { productId: product._id, brandId: brand.doc._id }, ago(between(4, 40) * HOUR));
    }
  }
  // Brand staff hear about new reviews (docs/12 §6) — one notification per review.
  for (const r of ds.reviews) {
    const brand = brands.find((b) => String(b.doc._id) === String(r.brandId));
    if (!brand) continue;
    const product = productById.get(String(r.productId));
    note(brand.owner._id, 'NEW_REVIEW', `New ${r.rating}-star review`,
      `A customer reviewed ${product ? product.name : 'a product'}: "${r.title}".`,
      { productId: r.productId, brandId: r.brandId, rating: r.rating },
      new Date(r.createdAt.getTime() + 60 * 1000));
  }
  for (const brand of brands) {
    for (const s of brand.staff) {
      note(brand.owner._id, 'EMPLOYEE_CREATED', `${s.user.name} joined your team`, `${s.user.name} was added as ${s.employee.jobTitle}. Review what they can do on the Team page.`, { employeeId: s.employee._id, brandId: brand.doc._id }, new Date(s.joined.getTime() + 60 * 1000));
      if (s.changed) {
        note(s.user._id, 'EMPLOYEE_PERMISSION_CHANGED', 'Your access was updated', `${brand.def.name} changed what you can do on the dashboard.`, { brandId: brand.doc._id }, new Date(s.joined.getTime() + 9 * DAY));
      }
    }
    note(brand.owner._id, 'SYSTEM_NOTIFICATION', 'Welcome to CityCart', 'Your brand account is ready. Add a category, then your first products.', { brandId: brand.doc._id }, new Date(brand.doc.createdAt.getTime() + 5 * 60 * 1000));
  }
  customers.forEach((c) => note(c.doc._id, 'SYSTEM_NOTIFICATION', 'Welcome to CityCart', 'Shop local brands in your city and pay in cash when your order arrives.', { kind: 'welcome' }, new Date(c.doc.createdAt.getTime() + 5 * 60 * 1000)));

  return ds;
}

module.exports = { buildDataset, money };