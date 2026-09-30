const { createOrderSchema, listOrdersQuerySchema } = require('../validators/order.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  checkout,
  listMyOrders,
  getOrderForUser,
  cancelMyOrder,
  OrderError,
} = require('../services/order.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: formatZodError(error),
  });
}

function handleError(err, res, next) {
  if (err instanceof OrderError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

async function create(req, res, next) {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const orders = await checkout(req.user._id, parsed.data);
    return res.status(201).json({ success: true, message: 'Order placed', orders });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function my(req, res, next) {
  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listMyOrders(req.user._id, parsed.data);
    return res.status(200).json({ success: true, orders: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const { order, payment } = await getOrderForUser(req.user, params.data.id);
    return res.status(200).json({ success: true, order, payment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function cancel(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const order = await cancelMyOrder(req.user._id, params.data.id);
    return res.status(200).json({ success: true, message: 'Order cancelled', order });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { create, my, getById, cancel };
