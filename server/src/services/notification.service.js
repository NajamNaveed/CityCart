const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
const { emitToUser } = require('../sockets');

/**
 * Notification domain logic (docs/12-notification-system.md). Both halves of
 * the feature live here and nowhere else:
 *
 *  - SEND side: business services call the `notify*` helpers AFTER their
 *    transaction has committed. Delivery is best-effort — a notification
 *    failure must never fail the business operation it describes (an order
 *    already exists whether or not its "new order" notification could be
 *    written), so notify() swallows and logs errors. All audience and
 *    message decisions are made here, keeping notification logic out of the
 *    business services (docs/12 §28.2).
 *  - READ side: the strictly user-scoped inbox APIs of docs/05 §21.
 *
 * This module only imports models/config/sockets — never other services —
 * so business services can require it without circular imports.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const paginate = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

function toPayload(doc) {
  return {
    _id: doc._id,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    data: doc.data,
    isRead: doc.isRead,
    createdAt: doc.createdAt,
  };
}

/**
 * Persists one notification per recipient and pushes it to whoever is
 * online. userIds are deduplicated and recipients are never told about each
 * other — each user only ever receives their own record's payload.
 */
async function notify({ userIds, type, title, message, data }) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return [];

    const docs = await Notification.insertMany(
      ids.map((userId) => ({ userId, type, title, message, data: data || {} })),
      { ordered: false }
    );
    for (const doc of docs) {
      emitToUser(doc.userId, toPayload(doc));
    }
    return docs;
  } catch (err) {
    console.error(`[notifications] could not deliver "${type}": ${err.message}`);
    return [];
  }
}

/**
 * Active staff of one brand (docs/12 §6, §22): every active BRAND_ADMIN plus
 * every active employee whose permissions include ANY of `anyOf` — the same
 * semantics as middleware/requirePermission.js, where BRAND_ADMIN always
 * qualifies and employees qualify per permission. With no `anyOf`, all
 * active staff qualify (system-wide events such as termination). The result
 * is user ids only, so Brand A audiences can never contain Brand B users.
 */
async function brandStaffIds(brandId, { anyOf } = {}) {
  const [admins, employees] = await Promise.all([
    User.find({ brandId, role: ROLES.BRAND_ADMIN, isActive: true }).select('_id'),
    Employee.find({ brandId, isActive: true }).select('userId permissions'),
  ]);
  const qualifying =
    !anyOf || anyOf.length === 0
      ? employees
      : employees.filter((e) => (e.permissions || []).some((p) => anyOf.includes(p)));
  return [
    ...new Set([...admins.map((u) => String(u._id)), ...qualifying.map((e) => String(e.userId))]),
  ];
}

async function superAdminIds() {
  const admins = await User.find({ role: ROLES.SUPER_ADMIN, isActive: true }).select('_id');
  return admins.map((u) => String(u._id));
}

// --------------------------------------------------------------------------
// SEND side — one helper per business event (docs/12 §5-§8)
// --------------------------------------------------------------------------

// Order statuses a CUSTOMER is told about. READY_FOR_SHIPMENT is internal
// brand workflow and intentionally absent (no notification type for it).
const ORDER_STATUS_NOTIFICATIONS = {
  CONFIRMED: {
    type: 'ORDER_CONFIRMED',
    title: 'Order confirmed',
    message: (o) => `Your order ${o.orderNumber} has been confirmed and is being prepared.`,
  },
  PROCESSING: {
    type: 'ORDER_PROCESSING',
    title: 'Order processing',
    message: (o) => `Your order ${o.orderNumber} is being processed.`,
  },
  REJECTED: {
    type: 'ORDER_REJECTED',
    title: 'Order rejected',
    message: (o) => `Your order ${o.orderNumber} could not be fulfilled by the brand.`,
  },
  SHIPPED: {
    type: 'ORDER_SHIPPED',
    title: 'Order shipped',
    message: (o) => `Your order ${o.orderNumber} has been shipped.`,
  },
  OUT_FOR_DELIVERY: {
    type: 'ORDER_OUT_FOR_DELIVERY',
    title: 'Out for delivery',
    message: (o) => `Your order ${o.orderNumber} is out for delivery.`,
  },
  DELIVERED: {
    type: 'ORDER_DELIVERED',
    title: 'Order delivered',
    message: (o) => `Your order ${o.orderNumber} has been delivered.`,
  },
};

function orderData(order) {
  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    brandId: String(order.brandId),
  };
}

/** One notification per created order, to that brand's staff (docs/12 §6). */
async function notifyBrandOfNewOrders(orders) {
  const byBrand = new Map();
  for (const order of orders || []) {
    if (!order) continue;
    const key = String(order.brandId);
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key).push(order);
  }
  for (const [brandId, brandOrders] of byBrand) {
    const staff = await brandStaffIds(brandId, { anyOf: [PERMISSIONS.ORDERS_VIEW] });
    for (const order of brandOrders) {
      await notify({
        userIds: staff,
        type: 'ORDER_CREATED',
        title: 'New order received',
        message: `Order ${order.orderNumber} — ${order.items.length} item(s), PKR ${order.total}.`,
        data: orderData(order),
      });
    }
  }
}

/**
 * Maps an order status to its customer-facing notification (docs/12 §5).
 * Unknown statuses (PENDING, CANCELLED, READY_FOR_SHIPMENT, return states)
 * send nothing.
 */
async function notifyCustomerOfOrderStatus(order, status) {
  const def = ORDER_STATUS_NOTIFICATIONS[status];
  if (!def || !order) return;
  await notify({
    userIds: [order.customerId],
    type: def.type,
    title: def.title,
    message: def.message(order),
    data: orderData(order),
  });
}

/** A customer cancelled; the brand's order viewers need to know (docs/12 §6). */
async function notifyBrandOfCancelledOrder(order) {
  if (!order) return;
  const staff = await brandStaffIds(order.brandId, { anyOf: [PERMISSIONS.ORDERS_VIEW] });
  await notify({
    userIds: staff,
    type: 'ORDER_CANCELLED',
    title: 'Order cancelled',
    message: `The customer cancelled order ${order.orderNumber}. Stock has been returned.`,
    data: orderData(order),
  });
}

/** COD cash collected — fires exactly once, from whichever site flips the payment. */
async function notifyPaymentReceived(order) {
  if (!order) return;
  await notify({
    userIds: [order.customerId],
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    message: `Your cash payment for order ${order.orderNumber} has been received.`,
    data: orderData(order),
  });
}

async function notifyRefundIssued(order, { amount, reason } = {}) {
  if (!order) return;
  await notify({
    userIds: [order.customerId],
    type: 'REFUND_ISSUED',
    title: 'Refund issued',
    message: `A refund of PKR ${amount} was issued for order ${order.orderNumber}${reason ? `: ${reason}` : '.'}`,
    data: { ...orderData(order), refundAmount: amount, refundReason: reason || null },
  });
}

/**
 * Stock-state transitions (docs/12 §6, §23). `transitions` entries carry
 * { brandId, productId, productName, from, to }; only entries that ENTERED
 * LOW_STOCK or OUT_OF_STOCK notify, so a checkout through an already-low
 * product or repeated saves of the same threshold never spam the staff.
 */
async function notifyStockTransitions(transitions) {
  for (const t of transitions || []) {
    if (!t || (t.to !== 'LOW_STOCK' && t.to !== 'OUT_OF_STOCK')) continue;
    if (t.from === t.to) continue;
    const staff = await brandStaffIds(t.brandId, {
      anyOf: [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_MANAGE],
    });
    await notify({
      userIds: staff,
      type: t.to,
      title: t.to === 'OUT_OF_STOCK' ? 'Product out of stock' : 'Product low in stock',
      message: `"${t.productName}" is ${t.to === 'OUT_OF_STOCK' ? 'out of stock' : 'low in stock'}.`,
      data: { productId: String(t.productId), brandId: String(t.brandId) },
    });
  }
}

async function notifyEmployeeCreated({ userId, brandId, brandName, jobTitle }) {
  await notify({
    userIds: [userId],
    type: 'EMPLOYEE_CREATED',
    title: 'Welcome to the team',
    message: `You have been added to the ${brandName} team${jobTitle ? ` as ${jobTitle}` : ''}.`,
    data: { brandId: String(brandId) },
  });
}

async function notifyEmployeePermissionsChanged({ userId, brandId, added = [], removed = [] }) {
  if (added.length === 0 && removed.length === 0) return;
  const brand = await Brand.findById(brandId).select('name');
  const changes = [
    added.length > 0 && `Granted: ${added.join(', ')}.`,
    removed.length > 0 && `Revoked: ${removed.join(', ')}.`,
  ].filter(Boolean);
  await notify({
    userIds: [userId],
    type: 'EMPLOYEE_PERMISSION_CHANGED',
    title: 'Your permissions changed',
    message: `Your permissions for ${brand ? brand.name : 'your brand'} were updated. ${changes.join(' ')}`,
    data: { brandId: String(brandId), added, removed },
  });
}

async function notifyBrandOfNewReview(review) {
  if (!review) return;
  const [staff, product] = await Promise.all([
    brandStaffIds(review.brandId, { anyOf: [PERMISSIONS.PRODUCTS_VIEW] }),
    Product.findById(review.productId).select('name'),
  ]);
  const name = product ? product.name : 'a product';
  await notify({
    userIds: staff,
    type: 'NEW_REVIEW',
    title: 'New review received',
    message: `A customer left a ${review.rating}-star review on "${name}"${review.title ? `: "${review.title}"` : '.'}`,
    data: { productId: String(review.productId), brandId: String(review.brandId), rating: review.rating },
  });
}

async function notifySuperAdminsOfNewBrand({ brandId, brandName, ownerName }) {
  await notify({
    userIds: await superAdminIds(),
    type: 'SYSTEM_NOTIFICATION',
    title: 'New brand registered',
    message: `${ownerName} registered the brand "${brandName}".`,
    data: { brandId: String(brandId) },
  });
}

async function notifyBrandOwnerWelcome({ userId, brandName }) {
  await notify({
    userIds: [userId],
    type: 'SYSTEM_NOTIFICATION',
    title: 'Welcome to CityCart',
    message: `Your brand "${brandName}" is live. Add products to start selling.`,
    data: {},
  });
}

async function notifyBrandTerminated({ brandId, brandName, reason }) {
  const staff = await brandStaffIds(brandId);
  await notify({
    userIds: staff,
    type: 'SYSTEM_NOTIFICATION',
    title: 'Brand terminated',
    message: `Your brand "${brandName}" has been terminated by CityCart${reason ? `: ${reason}` : '.'}`,
    data: { brandId: String(brandId) },
  });
}

// Only the statuses staff experience firsthand; PENDING->ACTIVE on a brand
// the staff just created would be noise.
const BRAND_STATUS_NOTIFICATIONS = {
  SUSPENDED: 'Your brand has been suspended by CityCart pending review.',
  ACTIVE: 'Your brand is active again.',
  REJECTED: 'Your brand application was rejected by CityCart.',
};

async function notifyBrandStatusChanged(brand, status) {
  const message = BRAND_STATUS_NOTIFICATIONS[status];
  if (!message || !brand) return;
  const staff = await brandStaffIds(brand._id);
  await notify({
    userIds: staff,
    type: 'SYSTEM_NOTIFICATION',
    title: 'Brand status changed',
    message: `${message} (brand "${brand.name}")`,
    data: { brandId: String(brand._id), status },
  });
}

// --------------------------------------------------------------------------
// READ side — the personal inbox APIs of docs/05 §21 / docs/12 §11
// --------------------------------------------------------------------------

async function listMyNotifications(userId, { page, limit } = {}) {
  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const filter = { userId };

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return {
    notifications: items,
    pagination: paginate(pageNumber, limitNumber, total),
    unreadCount,
  };
}

/**
 * Ownership is the filter itself: another user's id (or a non-existent one)
 * matches nothing and returns null -> the controller answers 404, never a
 * leak (docs/12 §26).
 */
async function markMyNotificationRead(userId, id) {
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );
}

async function markAllMyNotificationsRead(userId) {
  const result = await Notification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return { updated: result.modifiedCount || 0 };
}

async function deleteMyNotification(userId, id) {
  return Notification.findOneAndDelete({ _id: id, userId });
}

/**
 * Wraps a send-side helper so it can never fail its caller: not just the
 * notification write, but also the audience lookups before it (docs/12
 * §28.2 — business logic must not break because notifications did). The
 * read-side functions below are deliberately NOT wrapped; they must surface
 * errors to the controller.
 */
function bestEffort(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[notifications] could not deliver: ${err.message}`);
      return undefined;
    }
  };
}

module.exports = {
  notify,
  brandStaffIds,
  superAdminIds,
  notifyBrandOfNewOrders: bestEffort(notifyBrandOfNewOrders),
  notifyCustomerOfOrderStatus: bestEffort(notifyCustomerOfOrderStatus),
  notifyBrandOfCancelledOrder: bestEffort(notifyBrandOfCancelledOrder),
  notifyPaymentReceived: bestEffort(notifyPaymentReceived),
  notifyRefundIssued: bestEffort(notifyRefundIssued),
  notifyStockTransitions: bestEffort(notifyStockTransitions),
  notifyEmployeeCreated: bestEffort(notifyEmployeeCreated),
  notifyEmployeePermissionsChanged: bestEffort(notifyEmployeePermissionsChanged),
  notifyBrandOfNewReview: bestEffort(notifyBrandOfNewReview),
  notifySuperAdminsOfNewBrand: bestEffort(notifySuperAdminsOfNewBrand),
  notifyBrandOwnerWelcome: bestEffort(notifyBrandOwnerWelcome),
  notifyBrandTerminated: bestEffort(notifyBrandTerminated),
  notifyBrandStatusChanged: bestEffort(notifyBrandStatusChanged),
  listMyNotifications,
  markMyNotificationRead,
  markAllMyNotificationsRead,
  deleteMyNotification,
};
