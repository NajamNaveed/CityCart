const {
  serviceApplicationSchema,
  updateServiceProfileSchema,
  changeServiceBlockSchema,
  adminListProvidersQuerySchema,
  adminProviderStatusSchema,
} = require('../validators/serviceProvider.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  applyForProvider,
  getProviderForOwner,
  updateProviderProfile,
  changeProviderBlock,
  listServiceCategories,
  listProvidersForAdmin,
  getProviderForAdmin,
  changeProviderStatus,
  ServiceProviderError,
} = require('../services/serviceProvider.service');
const { toSafeUser } = require('../services/auth.service');
const { recordAdminAction } = require('../services/adminAction.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceProviderError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.extra || {}),
    });
  }
  return next(err);
}

// Public. No session yet: the provider and owner stay inactive until the
// owner verifies the inbox and the super admin approves the application.
async function apply(req, res, next) {
  const parsed = serviceApplicationSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { provider, user } = await applyForProvider(parsed.data);
    return res.status(201).json({
      success: true,
      message: 'Check your email to verify your account. CityCart will review your provider profile.',
      provider: { _id: provider._id, displayName: provider.displayName, status: provider.status },
      user: toSafeUser(user),
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function me(req, res, next) {
  try {
    return res.status(200).json({ success: true, ...(await getProviderForOwner(req.tenantProviderId)) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function updateMe(req, res, next) {
  const parsed = updateServiceProfileSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const provider = await updateProviderProfile(req.tenantProviderId, parsed.data);
    return res.status(200).json({ success: true, message: 'Profile updated.', provider });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function changeBlock(req, res, next) {
  const parsed = changeServiceBlockSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const provider = await changeProviderBlock(req.tenantProviderId, parsed.data);
    return res.status(200).json({ success: true, message: 'Service area updated.', provider });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function categories(req, res, next) {
  try {
    const items = await listServiceCategories();
    return res.status(200).json({ success: true, categories: items });
  } catch (err) {
    return next(err);
  }
}

async function adminList(req, res, next) {
  const parsed = adminListProvidersQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listProvidersForAdmin(parsed.data);
    return res.status(200).json({ success: true, providers: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminGet(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    return res.status(200).json({ success: true, ...(await getProviderForAdmin(params.data.id)) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminUpdateStatus(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = adminProviderStatusSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const result = await changeProviderStatus({
      providerId: params.data.id,
      status: body.data.status,
      reason: body.data.reason,
      adminId: req.user._id,
    });
    await recordAdminAction({
      actor: req.user,
      action: `serviceProvider.${body.data.status.toLowerCase()}`,
      target: {
        type: 'ServiceProvider',
        id: params.data.id,
        label: result.provider.displayName,
      },
      details: body.data.reason,
    });
    return res.status(200).json({
      success: true,
      message: `Provider is now ${body.data.status.toLowerCase()}.`,
      provider: result.provider,
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = {
  apply,
  me,
  updateMe,
  changeBlock,
  categories,
  adminList,
  adminGet,
  adminUpdateStatus,
};
