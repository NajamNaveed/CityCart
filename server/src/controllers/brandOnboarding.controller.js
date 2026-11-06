const {
  brandApplicationSchema,
  checkNameQuerySchema,
  terminateBrandSchema,
  adminListBrandsQuerySchema,
} = require('../validators/brandApplication.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const { applyForBrand, isBrandNameAvailable } = require('../services/brandOnboarding.service');
const { listAdminBrands, getAdminBrand, terminateBrand } = require('../services/brandAdmin.service');
const { BrandError } = require('../services/brand.service');
const { toSafeUser } = require('../services/auth.service');
const { formatZodError } = require('../utils/formatZodError');
const { recordAdminAction } = require('../services/adminAction.service');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof BrandError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

// Public. No session yet: the brand and owner stay inactive until the owner
// opens the emailed verification link (see services/emailAuth.service.js).
async function apply(req, res, next) {
  const parsed = brandApplicationSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { brand, branch, user } = await applyForBrand(parsed.data);
    return res.status(201).json({
      success: true,
      message: 'Check your email to verify your account and publish your shop.',
      brand,
      branch,
      user: toSafeUser(user),
    });
  } catch (err) {
    return handleError(err, res, next);
  }
}

const nameChecker = (check) => async (req, res, next) => {
  const parsed = checkNameQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    return res.status(200).json({ success: true, available: await check(parsed.data.name) });
  } catch (err) {
    return next(err);
  }
};

const checkBrandName = nameChecker(isBrandNameAvailable);

async function adminList(req, res, next) {
  const parsed = adminListBrandsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const { items, pagination } = await listAdminBrands(parsed.data);
    return res.status(200).json({ success: true, brands: items, pagination });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminGet(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    return res.status(200).json({ success: true, ...(await getAdminBrand(params.data.id)) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminTerminate(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = terminateBrandSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const result = await terminateBrand({
      brandId: params.data.id,
      reason: body.data.reason,
      graceHours: body.data.graceHours,
      adminId: req.user._id,
    });
    await recordAdminAction({
      actor: req.user,
      action: 'brand.terminate',
      target: { type: 'Brand', id: params.data.id },
      details: body.data.reason,
    });
    return res.status(200).json({ success: true, message: 'Brand terminated', ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { apply, checkBrandName, adminList, adminGet, adminTerminate };
