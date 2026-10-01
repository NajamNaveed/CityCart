const {
  listDeliveriesQuerySchema,
  updateDeliveryStatusSchema,
  updateDeliverySchema,
} = require('../validators/delivery.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listDeliveries,
  getDeliveryForUser,
  updateDeliveryStatus,
  updateDelivery,
} = require('../services/delivery.service');
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

// req.tenantBrandId (brand users only) comes from requireTenant.
async function list(req, res, next) {
  const parsed = listDeliveriesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listDeliveries(req.tenantBrandId, parsed.data);
    return res.status(200).json({ success: true, deliveries: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const delivery = await getDeliveryForUser(req.user, req.tenantBrandId, params.data.id);
    return res.status(200).json({ success: true, delivery });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updateStatus(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateDeliveryStatusSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const delivery = await updateDeliveryStatus({
      brandId: req.tenantBrandId,
      deliveryId: params.data.id,
      userId: req.user._id,
      ...body.data,
    });
    return res.status(200).json({ success: true, message: 'Delivery status updated', delivery });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateDeliverySchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const delivery = await updateDelivery({
      brandId: req.tenantBrandId,
      deliveryId: params.data.id,
      ...body.data,
    });
    return res.status(200).json({ success: true, message: 'Delivery updated', delivery });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, getById, updateStatus, update };
