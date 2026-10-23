const Receipt = require('../models/receipt.model');
const Payment = require('../models/payment.model');
const Order = require('../models/order.model');
const Brand = require('../models/brand.model');
const User = require('../models/user.model');
const Counter = require('../models/counter.model');
const { OrderError } = require('./order.service');
const { ROLES } = require('../config/roles');

const DEFAULT_LIMIT = 20;
// Statuses a payment has once money was received (a later refund keeps its receipt).
const RECEIVED = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/**
 * Receipt number, e.g. RC-2026-000001. One atomic counter per year, like order
 * numbers; a failed attempt may leave a gap, never a duplicate.
 */
async function nextReceiptNumber() {
  const year = new Date().getFullYear();
  const options = { upsert: true, new: true };
  let counter;
  try {
    counter = await Counter.findOneAndUpdate({ _id: `receipt-${year}` }, { $inc: { seq: 1 } }, options);
  } catch (err) {
    if (err.code !== 11000) throw err;
    counter = await Counter.findOneAndUpdate({ _id: `receipt-${year}` }, { $inc: { seq: 1 } }, options);
  }
  return `RC-${year}-${String(counter.seq).padStart(6, '0')}`;
}

/**
 * Issues the receipt for a payment that has been paid. Idempotent: if one exists
 * it is returned, and the unique index on paymentId decides a race. Returns null
 * for a payment that is not paid (nothing to receipt). It runs AFTER the payment
 * change commits, so a failure here can never undo a payment; reading a receipt
 * issues a missing one (getReceiptForOrder), so none is ever permanently lost.
 */
async function issueReceiptForPayment(paymentId) {
  if (!paymentId) return null;
  const existing = await Receipt.findOne({ paymentId });
  if (existing) return existing;

  const payment = await Payment.findOne({ _id: paymentId, status: { $in: RECEIVED } });
  if (!payment || !payment.paidAt) return null;
  const order = await Order.findById(payment.orderId);
  if (!order) return null;
  const [brand, collector] = await Promise.all([
    Brand.findById(order.brandId).select('name'),
    payment.collectedBy ? User.findById(payment.collectedBy).select('name') : null,
  ]);
  const address = order.shippingAddress || {};

  try {
    return await Receipt.create({
      receiptNumber: await nextReceiptNumber(),
      paymentId: payment._id,
      orderId: order._id,
      orderNumber: order.orderNumber,
      brandId: order.brandId,
      brandName: brand ? brand.name : 'CityCart brand',
      customerId: order.customerId,
      billedTo: address.name,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency || 'PKR',
      items: (order.items || []).map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
      })),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      tax: order.tax,
      transactionReference: payment.transactionReference,
      provider: payment.provider,
      collectedBy: payment.collectedBy,
      collectedByName: collector ? collector.name : undefined,
      issuedAt: payment.paidAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      return Receipt.findOne({ paymentId: payment._id });
    }
    throw err;
  }
}

// For the code paths that have just committed a payment: a problem here is
// logged, never thrown into the request that already succeeded.
async function issueReceiptBestEffort(paymentId) {
  try {
    return await issueReceiptForPayment(paymentId);
  } catch (err) {
    console.error(`[receipts] could not issue a receipt: ${err.message}`);
    return null;
  }
}

// --- Who sees what (docs/20 §4) -------------------------------------------

const common = (r) => ({
  _id: r._id,
  receiptNumber: r.receiptNumber,
  orderId: r.orderId,
  orderNumber: r.orderNumber,
  brandName: r.brandName,
  billedTo: r.billedTo,
  method: r.method,
  amount: r.amount,
  currency: r.currency,
  items: r.items,
  subtotal: r.subtotal,
  deliveryFee: r.deliveryFee,
  discount: r.discount,
  tax: r.tax,
  issuedAt: r.issuedAt,
});

// The customer sees their own receipt, without internal details (who collected the cash).
const customerView = common;
// The brand also sees the payment reference and who collected the cash.
const brandView = (r) => ({
  ...common(r),
  paymentId: r.paymentId,
  transactionReference: r.transactionReference,
  provider: r.provider,
  collectedByName: r.collectedByName,
});
const adminView = (r) => ({ ...brandView(r), brandId: r.brandId, customerId: r.customerId });

function viewFor(user) {
  if (user.role === ROLES.CUSTOMER) return customerView;
  if (user.role === ROLES.SUPER_ADMIN) return adminView;
  return brandView;
}

// Customers: their own. Brand users: their brand's (tenantBrandId). Super admin: all.
function scopeFor(user, tenantBrandId) {
  if (user.role === ROLES.CUSTOMER) return { customerId: user._id };
  if (user.role === ROLES.SUPER_ADMIN) return {};
  return { brandId: tenantBrandId };
}

async function listReceipts(user, tenantBrandId, { from, to, page, limit } = {}) {
  const filter = scopeFor(user, tenantBrandId);
  if (from || to) {
    filter.issuedAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  }
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;
  const [items, total] = await Promise.all([
    Receipt.find(filter)
      .sort({ issuedAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Receipt.countDocuments(filter),
  ]);
  return {
    items: items.map(viewFor(user)),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

// Someone else's receipt is a 404 (not 403), so ids cannot be probed.
async function getReceipt(user, tenantBrandId, id) {
  const receipt = await Receipt.findOne({ _id: id, ...scopeFor(user, tenantBrandId) });
  if (!receipt) {
    throw new OrderError(404, 'Receipt not found.');
  }
  return viewFor(user)(receipt);
}

/**
 * The receipt of an order, issued on the spot if the payment was paid but the
 * receipt was never written (see issueReceiptForPayment). The order is looked up
 * with the caller's scope first, so nobody can reach another person's order.
 */
async function getReceiptForOrder(user, tenantBrandId, orderId) {
  const order = await Order.findOne({ _id: orderId, ...scopeFor(user, tenantBrandId) });
  if (!order) {
    throw new OrderError(404, 'Order not found.');
  }
  let receipt = await Receipt.findOne({ orderId: order._id });
  if (!receipt) {
    const payment = await Payment.findOne({ orderId: order._id });
    receipt = payment ? await issueReceiptForPayment(payment._id) : null;
  }
  if (!receipt) {
    throw new OrderError(404, 'There is no receipt yet: the order has not been paid.', { code: 'NO_RECEIPT' });
  }
  return viewFor(user)(receipt);
}

module.exports = {
  issueReceiptForPayment,
  issueReceiptBestEffort,
  listReceipts,
  getReceipt,
  getReceiptForOrder,
};
