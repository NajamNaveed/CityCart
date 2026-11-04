const {
  listReturnsQuerySchema,
  receiveReturnSchema,
  returnPhotoQuerySchema,
} = require('../validators/delivery.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listReturns,
  getReturn,
  returnsSummary,
  receiveReturn,
  getReturnPhotoLink,
} = require('../services/return.service');
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

// req.tenantBrandId (brand users only) comes from requireTenant. Platform admins
// get null and see every brand.
async function list(req, res, next) {
  const parsed = listReturnsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listReturns(req.user, req.tenantBrandId, parsed.data);
    return res.status(200).json({ success: true, returns: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function summary(req, res, next) {
  try {
    const totals = await returnsSummary(req.user, req.tenantBrandId);
    return res.status(200).json({ success: true, summary: totals });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getById(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const ret = await getReturn(req.user, req.tenantBrandId, params.data.id);
    return res.status(200).json({ success: true, return: ret });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// A short-lived signed link to one refused line's private photo. The photo path
// itself never leaves the server.
async function photo(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const query = returnPhotoQuerySchema.safeParse(req.query);
  if (!query.success) return invalid(res, query.error);
  try {
    const link = await getReturnPhotoLink(req.user, req.tenantBrandId, params.data.id, query.data.line);
    return res.status(200).json({ success: true, ...link });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// The store takes the goods in. Brand users only: this changes stock.
async function receive(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = receiveReturnSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const ret = await receiveReturn({
      user: req.user,
      tenantBrandId: req.tenantBrandId,
      returnId: params.data.id,
      decisions: body.data.decisions,
    });
    return res.status(200).json({ success: true, message: 'Return received', return: ret });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, summary, getById, photo, receive };
