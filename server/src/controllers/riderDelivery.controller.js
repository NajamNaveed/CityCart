const { riderListQuerySchema, riderStatusSchema, completeDeliverySchema, riderLocationSchema } = require('../validators/delivery.validator');
const { recordLocation, clearLocation } = require('../services/riderLocation.service');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listRiderDeliveries,
  getRiderDelivery,
  riderUpdateStatus,
  completeWithCode,
  riderCash,
} = require('../services/riderDelivery.service');
const { OrderError } = require('../services/order.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof OrderError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

// Brand and rider both come from the signed-in user, never from the request.
const who = (req) => ({ brandId: String(req.user.brandId), riderId: req.user._id });

async function list(req, res, next) {
  const parsed = riderListQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listRiderDeliveries({ ...who(req), ...parsed.data });
    return res.status(200).json({ success: true, deliveries: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const delivery = await getRiderDelivery({ ...who(req), id: params.data.id });
    return res.status(200).json({ success: true, delivery });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updateStatus(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = riderStatusSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const delivery = await riderUpdateStatus({ ...who(req), id: params.data.id, ...body.data });
    return res.status(200).json({ success: true, message: 'Delivery status updated', delivery });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function complete(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = completeDeliverySchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const delivery = await completeWithCode({ ...who(req), id: params.data.id, code: body.data.code });
    return res.status(200).json({ success: true, message: 'Delivery completed', delivery });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function cash(req, res, next) {
  try {
    const result = await riderCash(who(req));
    return res.status(200).json({ success: true, cash: result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// The rider's phone reports where it is (only while they share and have a delivery out).
async function shareLocation(req, res, next) {
  const body = riderLocationSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    await recordLocation({ ...who(req), ...body.data });
    return res.status(200).json({ success: true });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function stopSharing(req, res, next) {
  try {
    await clearLocation({ riderId: req.user._id });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getById, updateStatus, complete, cash, shareLocation, stopSharing };
