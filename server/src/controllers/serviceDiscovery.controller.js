const {
  discoverServicesQuerySchema,
  providerSlugParamSchema,
} = require('../validators/serviceOffering.validator');
const {
  discoverServices,
  getPublicProvider,
  ServiceDiscoveryError,
} = require('../services/serviceDiscovery.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceDiscoveryError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

// Public: shoppers find approved providers in their block, with no account.
async function discover(req, res, next) {
  const parsed = discoverServicesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    return res.status(200).json({ success: true, ...(await discoverServices(parsed.data)) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// Public provider page. Pending or unapproved providers are a 404, like a
// missing link, so applications stay private.
async function publicProvider(req, res, next) {
  const params = providerSlugParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    return res.status(200).json({ success: true, provider: await getPublicProvider(params.data.slug) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { discover, publicProvider };
