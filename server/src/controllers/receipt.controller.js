const { listReceiptsQuerySchema } = require('../validators/receipt.validator');
const { orderIdParamSchema } = require('../validators/payment.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const { listReceipts, getReceipt, getReceiptForOrder } = require('../services/receipt.service');
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

// req.tenantBrandId is set for brand users only (from requireTenant).
async function list(req, res, next) {
  const parsed = listReceiptsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listReceipts(req.user, req.tenantBrandId, parsed.data);
    return res.status(200).json({ success: true, receipts: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const receipt = await getReceipt(req.user, req.tenantBrandId, params.data.id);
    return res.status(200).json({ success: true, receipt });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getByOrder(req, res, next) {
  const params = orderIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const receipt = await getReceiptForOrder(req.user, req.tenantBrandId, params.data.orderId);
    return res.status(200).json({ success: true, receipt });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, getById, getByOrder };
