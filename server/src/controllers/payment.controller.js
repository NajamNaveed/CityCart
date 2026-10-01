const { orderIdParamSchema, updatePaymentStatusSchema } = require('../validators/payment.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const { getPaymentForOrder, updatePaymentStatus } = require('../services/payment.service');
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

// req.tenantBrandId is set for brand users only (undefined/null otherwise).
async function getForOrder(req, res, next) {
  const params = orderIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const payment = await getPaymentForOrder(req.user, req.tenantBrandId, params.data.orderId);
    return res.status(200).json({ success: true, payment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updateStatus(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updatePaymentStatusSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const payment = await updatePaymentStatus({
      userId: req.user._id,
      tenantBrandId: req.tenantBrandId || null,
      paymentId: params.data.id,
      ...body.data,
    });
    return res.status(200).json({ success: true, message: 'Payment status updated', payment });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { getForOrder, updateStatus };
