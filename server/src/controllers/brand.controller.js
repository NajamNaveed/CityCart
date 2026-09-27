const {
  createBrandSchema,
  updateBrandSchema,
  updateBrandStatusSchema,
  listBrandsQuerySchema,
} = require('../validators/brand.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listPublicBrands,
  getPublicBrandById,
  createBrand,
  applyBrandUpdate,
  updateBrandStatus,
  BrandError,
} = require('../services/brand.service');
const { formatZodError } = require('../utils/formatZodError');

async function list(req, res, next) {
  const parsedQuery = listBrandsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  try {
    const brands = await listPublicBrands(parsedQuery.data);
    return res.status(200).json({ success: true, brands });
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  try {
    const brand = await getPublicBrandById(parsedParams.data.id);
    return res.status(200).json({ success: true, brand });
  } catch (err) {
    if (err instanceof BrandError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function create(req, res, next) {
  const parsedBody = createBrandSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    // parsedBody.data never contains brandId/status — createBrandSchema
    // doesn't define those fields, so even if a caller sent
    // req.user's brandId or an arbitrary status in the body, it's
    // dropped by Zod before reaching the service.
    const brand = await createBrand(parsedBody.data);
    return res.status(201).json({ success: true, message: 'Brand created', brand });
  } catch (err) {
    if (err instanceof BrandError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  const parsedBody = updateBrandSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    // req.resource was already loaded and brand-ownership-verified by
    // the requireBrandOwnership middleware (routes/brand.routes.js) —
    // reused here rather than fetching the brand a second time.
    const brand = await applyBrandUpdate(req.resource, parsedBody.data);
    return res.status(200).json({ success: true, message: 'Brand updated', brand });
  } catch (err) {
    if (err instanceof BrandError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function updateStatus(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  const parsedBody = updateBrandStatusSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const brand = await updateBrandStatus(parsedParams.data.id, parsedBody.data.status);
    return res.status(200).json({ success: true, message: 'Brand status updated', brand });
  } catch (err) {
    if (err instanceof BrandError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { list, getById, create, update, updateStatus };