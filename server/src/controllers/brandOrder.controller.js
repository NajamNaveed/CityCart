const {
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  proposeAdjustmentSchema,
  adjustmentParamsSchema,
} = require('../validators/order.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  proposeAdjustment: proposeAdjustmentService,
  withdrawAdjustment: withdrawAdjustmentService,
} = require('../services/orderAdjustment.service');
const {
  listBrandOrders,
  getBrandOrder,
  updateBrandOrderStatus,
} = require('../services/brandOrder.service');
const { OrderError } = require('../services/order.service');
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

// req.tenantBrandId comes from requireTenant (the user's own brand).
async function list(req, res, next) {
  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listBrandOrders(req.tenantBrandId, parsed.data);
    return res.status(200).json({ success: true, orders: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const { order, payment, delivery, adjustments, adjustment } = await getBrandOrder(
      req.tenantBrandId,
      params.data.id
    );
    return res.status(200).json({ success: true, order, payment, delivery, adjustments, adjustment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// POST /brand/orders/:id/adjustments — propose a substitution/removal.
async function proposeAdjustment(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = proposeAdjustmentSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const adjustment = await proposeAdjustmentService({
      brandId: req.tenantBrandId,
      orderId: params.data.id,
      userId: req.user._id,
      ...body.data,
    });
    return res.status(201).json({ success: true, message: 'Proposal sent to the customer', adjustment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// POST /brand/orders/:id/adjustments/:adjustmentId/withdraw
async function withdrawAdjustment(req, res, next) {
  const params = adjustmentParamsSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const adjustment = await withdrawAdjustmentService({
      brandId: req.tenantBrandId,
      orderId: params.data.id,
      adjustmentId: params.data.adjustmentId,
      userId: req.user._id,
    });
    return res.status(200).json({ success: true, message: 'Proposal withdrawn', adjustment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updateStatus(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateOrderStatusSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const order = await updateBrandOrderStatus({
      brandId: req.tenantBrandId,
      orderId: params.data.id,
      status: body.data.status,
      userId: req.user._id,
    });
    return res.status(200).json({ success: true, message: 'Order status updated', order });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, getById, updateStatus, proposeAdjustment, withdrawAdjustment };
