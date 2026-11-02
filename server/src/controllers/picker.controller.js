const {
  listQueueQuerySchema,
  pickLineSchema,
  pickerAdjustmentSchema,
  orderItemParamsSchema,
  productSearchQuerySchema,
} = require('../validators/picker.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listQueue,
  getPickerOrder,
  claimOrder,
  setLinePick,
  proposeFromPicking,
  packOrder,
  searchProducts,
} = require('../services/picker.service');
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

// req.tenantBrandId comes from requireTenant (the picker's own brand).
async function queue(req, res, next) {
  const parsed = listQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listQueue(req.tenantBrandId, req.user._id, parsed.data);
    return res.status(200).json({ success: true, orders: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const order = await getPickerOrder({
      brandId: req.tenantBrandId,
      pickerId: req.user._id,
      orderId: params.data.id,
    });
    return res.status(200).json({ success: true, order });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function claim(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const order = await claimOrder({
      brandId: req.tenantBrandId,
      pickerId: req.user._id,
      orderId: params.data.id,
    });
    return res.status(200).json({ success: true, message: 'Order claimed', order });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function pickLine(req, res, next) {
  const params = orderItemParamsSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = pickLineSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const order = await setLinePick({
      brandId: req.tenantBrandId,
      pickerId: req.user._id,
      orderId: params.data.id,
      itemId: params.data.itemId,
      pickStatus: body.data.pickStatus,
      pickedQty: body.data.pickedQty,
    });
    return res.status(200).json({ success: true, message: 'Line updated', order });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function propose(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = pickerAdjustmentSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const adjustment = await proposeFromPicking({
      brandId: req.tenantBrandId,
      pickerId: req.user._id,
      orderId: params.data.id,
      ...body.data,
    });
    return res.status(201).json({ success: true, message: 'Proposal sent to the customer', adjustment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function pack(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const order = await packOrder({
      brandId: req.tenantBrandId,
      pickerId: req.user._id,
      orderId: params.data.id,
    });
    return res.status(200).json({ success: true, message: 'Order packed and ready for a rider', order });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function products(req, res, next) {
  const parsed = productSearchQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await searchProducts(req.tenantBrandId, parsed.data);
    return res.status(200).json({ success: true, products: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { queue, getById, claim, pickLine, propose, pack, products };
