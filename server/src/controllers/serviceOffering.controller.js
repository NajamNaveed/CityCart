const {
  createOfferingSchema,
  updateOfferingSchema,
  offeringIdParamSchema,
} = require('../validators/serviceOffering.validator');
const {
  listOwnOfferings,
  createOffering,
  updateOffering,
  deactivateOffering,
  ServiceOfferingError,
} = require('../services/serviceOffering.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceOfferingError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
    });
  }
  return next(err);
}

async function list(req, res, next) {
  try {
    return res.status(200).json({ success: true, offerings: await listOwnOfferings(req.tenantProviderId) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function create(req, res, next) {
  const parsed = createOfferingSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const offering = await createOffering(req.tenantProviderId, parsed.data);
    return res.status(201).json({ success: true, message: 'Service added.', offering });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = offeringIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const parsed = updateOfferingSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const offering = await updateOffering(req.tenantProviderId, params.data.id, parsed.data);
    return res.status(200).json({ success: true, message: 'Service updated.', offering });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function remove(req, res, next) {
  const params = offeringIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const offering = await deactivateOffering(req.tenantProviderId, params.data.id);
    return res.status(200).json({ success: true, message: 'Service removed.', offering });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, create, update, remove };
