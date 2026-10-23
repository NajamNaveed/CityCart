const { outstandingQuerySchema, settleCashSchema } = require('../validators/cash.validator');
const { cashOutstanding, settleCash } = require('../services/cashSettlement.service');
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

// The brand always comes from the signed-in user (req.tenantBrandId).
async function outstanding(req, res, next) {
  const parsed = outstandingQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await cashOutstanding({ brandId: req.tenantBrandId, collectorId: parsed.data.collectorId });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function settle(req, res, next) {
  const parsed = settleCashSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await settleCash({ brandId: req.tenantBrandId, userId: req.user._id, ...parsed.data });
    return res.status(200).json({ success: true, message: 'Cash settled', ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { outstanding, settle };
