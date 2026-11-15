const { z } = require('zod');

const Brand = require('../../../models/brand.model');
const { ORDER_STATUSES } = require('../../../config/orderStatuses');
const {
  listMyOrders,
  getOrderForUser,
  CANCELLABLE_BY_CUSTOMER,
} = require('../../order.service');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const ITEM_PREVIEW = 3;
const HISTORY_PREVIEW = 4;

const orderIdSchema = z.string().regex(/^[0-9a-f]{24}$/i);

async function brandNamesFor(orders) {
  const ids = [...new Set(orders.map((order) => String(order.brandId)).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const brands = await Brand.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(brands.map((brand) => [String(brand._id), brand.name]));
}

/**
 * The customer-safe card for one order. Actions are built here, from the
 * status and payment the backend already enforces, never from the model:
 * only an unpaid PENDING order can be cancelled, and "Start return" is absent
 * because CityCart has no customer-initiated return after delivery (docs/22 §F).
 */
function orderCard(order, brandName = null) {
  const items = Array.isArray(order.items) ? order.items : [];
  const canCancel =
    CANCELLABLE_BY_CUSTOMER.includes(order.orderStatus) && order.paymentStatus !== 'PAID';
  const actions = [];
  if (canCancel) actions.push({ type: 'cancel_order', orderId: String(order._id), label: 'Cancel order' });
  actions.push({ type: 'view_order', orderId: String(order._id), label: 'View order' });

  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    total: order.total,
    netTotal: order.netTotal ?? null,
    currency: order.currency || 'PKR',
    itemCount: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    brandName,
    placedAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
    items: items.slice(0, ITEM_PREVIEW).map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      totalPrice: item.totalPrice,
    })),
    actions,
  };
}

const listOrdersTool = {
  name: 'list_my_orders',
  argsHint: '{ status?: string, limit?: 1-10 }',
  description:
    'List the signed-in customer’s own orders, newest first. Optionally filter by an order status such as PENDING, DELIVERED or CANCELLED. Returns real order cards with status, total and the item count.',
  argsSchema: z
    .object({
      status: z.enum(ORDER_STATUSES).optional(),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
    })
    .strict(),
  async run(ctx, args) {
    // The customer id comes from the authenticated request, never from the model.
    const { items } = await listMyOrders(ctx.userId, {
      status: args.status,
      limit: args.limit || DEFAULT_LIMIT,
    });
    const names = await brandNamesFor(items);
    const orders = items.map((order) => ctx.rememberOrder(orderCard(order, names.get(String(order.brandId)) || null)));
    return { count: orders.length, orders };
  },
};

const getOrderTool = {
  name: 'get_order',
  argsHint: '{ orderId: string }',
  description:
    'Read one of the signed-in customer’s own orders by its id, including the recent status history. An order that belongs to someone else is simply not found.',
  argsSchema: z.object({ orderId: orderIdSchema }).strict(),
  async run(ctx, args) {
    let result;
    try {
      result = await getOrderForUser({ _id: ctx.userId, role: ctx.role }, args.orderId);
    } catch (err) {
      if (err.status === 404) return { found: false, order: null };
      throw err;
    }

    const { order } = result;
    const names = await brandNamesFor([order]);
    const card = ctx.rememberOrder(orderCard(order, names.get(String(order.brandId)) || null));
    const history = (order.statusHistory || [])
      .slice(-HISTORY_PREVIEW)
      .map((entry) => ({ status: entry.status, at: entry.at ? new Date(entry.at).toISOString() : null }));

    return {
      found: true,
      order: card,
      recentStatusChanges: history,
      fulfilment: order.fulfilment || null,
      returnedAmount: order.returnedAmount || 0,
      netTotal: order.netTotal ?? null,
    };
  },
};

module.exports = { listOrdersTool, getOrderTool, orderCard };
