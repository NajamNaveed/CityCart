const { replaceAvailabilitySchema } = require('../validators/serviceAvailability.validator');
const {
  getAvailability,
  replaceAvailability,
  ServiceAvailabilityError,
} = require('../services/serviceAvailability.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceAvailabilityError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
    });
  }
  return next(err);
}

async function mine(req, res, next) {
  try {
    return res.status(200).json({ success: true, availability: await getAvailability(req.tenantProviderId) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function replaceMine(req, res, next) {
  const parsed = replaceAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const availability = await replaceAvailability(req.tenantProviderId, parsed.data);
    return res.status(200).json({ success: true, message: 'Availability saved.', availability });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { mine, replaceMine };
