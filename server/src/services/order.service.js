const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const Inventory = require('../models/inventory.model');
const Counter = require('../models/counter.model');
const { runInTransaction } = require('../utils/transaction');
const { evaluateLine } = require('./cart.service');
const { deductStock, restockStock, InventoryError } = require('./inventory.service');

const CURRENCY = 'PKR';
const CANCELLABLE_BY_CUSTOMER = ['PENDING']; // docs/08 §21 (confirmed policy)
const DEFAULT_LIMIT = 20;

class OrderError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Money as integer cents internally (docs/08 §12).
const toCents = (price) => Math.round(price * 100);
const fromCents = (cents) => cents / 100;

/**
 * Human-readable unique order number, e.g. CC-2026-000001 (docs/08 §4).
 * Atomic counter, allocated OUTSIDE the transaction so concurrent checkouts
 * don't conflict on it; a failed checkout may leave a gap, never a duplicate.
 */
async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const options = { upsert: true, new: true };
  let counter;
  try {
    counter = await Counter.findOneAndUpdate({ _id: `order-${year}` }, { $inc: { seq: 1 } }, options);
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Two first-ever upserts raced; the doc exists now, so this succeeds.
    counter = await Counter.findOneAndUpdate({ _id: `order-${year}` }, { $inc: { seq: 1 } }, options);
  }
  return `CC-${year}-${String(counter.seq).padStart(6, '0')}`;
}

// API spec field names -> Order.shippingAddress snapshot (docs/08 §10).
function toAddressSnapshot(a) {
  return {
    name: a.fullName,
    phone: a.phone,
    address: a.addressLine,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    additionalInstructions: a.additionalInstructions,
  };
}

/**
 * Checkout (docs/08 §6, docs/05 §15). ALL of it runs in one transaction:
 * cart read -> validation -> per-brand orders -> stock deduction ->
 * payment records -> cart clear. Any failure aborts everything, so there is
 * never a partial order, a deducted-but-unordered item, or a cleared cart
 * without orders (docs/08 §24).
 *
 * Double-submit is safe without an idempotency key: both requests write the
 * same cart document, so one hits a write conflict, is retried, and then
 * sees an empty cart.
 */
async function checkout(userId, { shippingAddress, paymentMethod }) {
  const address = toAddressSnapshot(shippingAddress);

  return runInTransaction(async (session) => {
    const cart = await Cart.findOne({ userId }).session(session);
    if (!cart || cart.items.length === 0) {
      throw new OrderError(400, 'Your cart is empty.', { code: 'CART_EMPTY' });
    }

    const productIds = cart.items.map((i) => i.productId);
    const [products, inventories] = await Promise.all([
      Product.find({ _id: { $in: productIds } }).session(session),
      Inventory.find({ productId: { $in: productIds } }).session(session),
    ]);
    const brandIds = [...new Set(products.map((p) => String(p.brandId)))];
    const brands = await Brand.find({ _id: { $in: brandIds } }).session(session);

    const productById = new Map(products.map((p) => [String(p._id), p]));
    const brandById = new Map(brands.map((b) => [String(b._id), b]));
    const inventoryById = new Map(inventories.map((i) => [String(i.productId), i]));

    // 1. Validate EVERY line (same rules as the cart). All problems are
    //    reported together; the whole checkout fails (docs/08 §23).
    const issues = [];
    const lines = [];
    cart.items.forEach((item) => {
      const product = productById.get(String(item.productId));
      const problem = evaluateLine({
        product,
        brand: product && brandById.get(String(product.brandId)),
        inventory: inventoryById.get(String(item.productId)),
        quantity: item.quantity,
      });
      if (problem) {
        issues.push({
          productId: item.productId,
          name: product ? product.name : null,
          ...problem,
        });
      } else {
        lines.push({ product, quantity: item.quantity });
      }
    });
    if (issues.length > 0) {
      throw new OrderError(409, 'Some items in your cart are no longer available.', {
        code: 'CHECKOUT_ISSUES',
        issues,
      });
    }

    // 2. Deduct stock in a fixed (productId) order so concurrent checkouts
    //    lock inventory rows in the same sequence.
    const sorted = [...lines].sort((a, b) => String(a.product._id).localeCompare(String(b.product._id)));
    for (const { product, quantity } of sorted) {
      try {
        await deductStock(product._id, quantity, { session });
      } catch (err) {
        if (err instanceof InventoryError) {
          throw new OrderError(409, 'Some items in your cart are no longer available.', {
            code: 'CHECKOUT_ISSUES',
            issues: [{ productId: product._id, name: product.name, code: 'INSUFFICIENT_STOCK' }],
          });
        }
        throw err;
      }
    }

    // 3. One order per brand — brand taken from the PRODUCT, never the client.
    const byBrand = new Map();
    lines.forEach((line) => {
      const key = String(line.product.brandId);
      if (!byBrand.has(key)) byBrand.set(key, []);
      byBrand.get(key).push(line);
    });

    const orderDocs = [];
    for (const [brandId, brandLines] of byBrand) {
      let subtotalCents = 0;
      const items = brandLines.map(({ product, quantity }) => {
        const totalCents = toCents(product.price) * quantity;
        subtotalCents += totalCents;
        return {
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity,
          unitPrice: product.price,
          totalPrice: fromCents(totalCents),
          image: product.images && product.images.length ? product.images[0] : undefined,
        };
      });
      const orderNumber = await nextOrderNumber();
      orderDocs.push({
        orderNumber,
        customerId: userId,
        brandId,
        items,
        shippingAddress: address,
        subtotal: fromCents(subtotalCents),
        deliveryFee: 0,
        discount: 0,
        tax: 0,
        total: fromCents(subtotalCents), // no fees/discounts yet (docs/08 §11)
        currency: CURRENCY,
        paymentMethod,
        paymentStatus: 'PENDING',
        orderStatus: 'PENDING',
      });
    }

    const orders = await Order.create(orderDocs, { session, ordered: true });

    // 4. Payment record per order (docs/08 §25): COD -> PENDING.
    await Payment.create(
      orders.map((o) => ({
        orderId: o._id,
        customerId: userId,
        amount: o.total,
        currency: CURRENCY,
        method: paymentMethod,
        status: 'PENDING',
      })),
      { session, ordered: true }
    );

    // 5. Clear the cart.
    await Cart.updateOne({ userId }, { $set: { items: [] } }, { session });

    return orders;
  });
}

async function listMyOrders(userId, { status, page, limit } = {}) {
  const filter = { customerId: userId };
  if (status) filter.orderStatus = status;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Order.countDocuments(filter),
  ]);
  return {
    items,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
  };
}

/**
 * Customers only ever see their own orders (someone else's order is a 404,
 * not a 403, so ids can't be probed). SUPER_ADMIN may view any order.
 * Brand-side access lives on /brand/orders (A5b).
 */
async function getOrderForUser(user, orderId) {
  const filter = { _id: orderId };
  if (user.role === 'CUSTOMER') {
    filter.customerId = user._id;
  }
  const order = await Order.findOne(filter);
  if (!order) {
    throw new OrderError(404, 'Order not found.');
  }
  const payment = await Payment.findOne({ orderId: order._id });
  return { order, payment };
}

/**
 * Customer cancellation (docs/08 §21, §22). The status change is a single
 * atomic conditional update (PENDING -> CANCELLED); only the request that
 * wins it restocks, so duplicate/concurrent cancels can never add stock
 * twice (docs/09 §14). Status change, restock and payment update commit
 * together or not at all.
 */
async function cancelMyOrder(userId, orderId) {
  return runInTransaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, customerId: userId, orderStatus: { $in: CANCELLABLE_BY_CUSTOMER } },
      { $set: { orderStatus: 'CANCELLED', paymentStatus: 'CANCELLED' } },
      { new: true, session }
    );

    if (!order) {
      const existing = await Order.findOne({ _id: orderId, customerId: userId }).session(session);
      if (!existing) {
        throw new OrderError(404, 'Order not found.');
      }
      throw new OrderError(409, `An order that is ${existing.orderStatus} cannot be cancelled.`, {
        code: 'NOT_CANCELLABLE',
        orderStatus: existing.orderStatus,
      });
    }

    const sorted = [...order.items].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
    for (const item of sorted) {
      await restockStock(item.productId, item.quantity, { session });
    }
    await Payment.updateMany(
      { orderId: order._id, status: 'PENDING' },
      { $set: { status: 'CANCELLED' } },
      { session }
    );
    return order;
  });
}

module.exports = {
  checkout,
  listMyOrders,
  getOrderForUser,
  cancelMyOrder,
  nextOrderNumber,
  OrderError,
};
