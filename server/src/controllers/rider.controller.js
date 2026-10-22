const {
  createRiderSchema,
  updateRiderSchema,
  resetRiderPasswordSchema,
  listRidersQuerySchema,
} = require('../validators/rider.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const { listRiders, createRider, updateRider, resetRiderPassword, RiderError } = require('../services/rider.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof RiderError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  return next(err);
}

// The brand always comes from the signed-in user (req.tenantBrandId, set by
// requireTenant), never from the request body or query.
async function list(req, res, next) {
  const parsed = listRidersQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listRiders({ ...parsed.data, brandId: req.tenantBrandId });
    return res.status(200).json({ success: true, riders: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function create(req, res, next) {
  const parsed = createRiderSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const rider = await createRider({ brandId: req.tenantBrandId, data: parsed.data });
    return res.status(201).json({ success: true, message: 'Rider created', rider });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateRiderSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const rider = await updateRider({ brandId: req.tenantBrandId, id: params.data.id, data: body.data });
    return res.status(200).json({ success: true, message: 'Rider updated', rider });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function resetPassword(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = resetRiderPasswordSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const rider = await resetRiderPassword({ brandId: req.tenantBrandId, id: params.data.id, password: body.data.password });
    return res.status(200).json({ success: true, message: 'Rider password reset', rider });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, create, update, resetPassword };
