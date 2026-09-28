const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} = require('../validators/product.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listPublicProducts,
  getPublicProductById,
  createProduct,
  applyProductUpdate,
  archiveProduct,
  ProductError,
} = require('../services/product.service');
const { formatZodError } = require('../utils/formatZodError');

async function list(req, res, next) {
  const parsedQuery = listProductsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  try {
    const { items, pagination } = await listPublicProducts(parsedQuery.data);
    return res.status(200).json({ success: true, products: items, pagination });
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
    const product = await getPublicProductById(parsedParams.data.id);
    return res.status(200).json({ success: true, product });
  } catch (err) {
    if (err instanceof ProductError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function create(req, res, next) {
  const parsedBody = createProductSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  // req.tenantBrandId comes from requireTenant (req.user.brandId) — never
  // from client input. SUPER_ADMIN has no brand, and a product always
  // needs one, so reject with a clear 400 (not a 500).
  if (!req.tenantBrandId) {
    return res.status(400).json({
      success: false,
      message: 'A brand account is required to create a product.',
    });
  }

  try {
    const product = await createProduct(req.tenantBrandId, parsedBody.data);
    return res.status(201).json({ success: true, message: 'Product created', product });
  } catch (err) {
    if (err instanceof ProductError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const parsedBody = updateProductSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    // req.resource was loaded and brand-ownership-verified by
    // requireBrandOwnership (routes/product.routes.js).
    const product = await applyProductUpdate(req.resource, parsedBody.data);
    return res.status(200).json({ success: true, message: 'Product updated', product });
  } catch (err) {
    if (err instanceof ProductError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const product = await archiveProduct(req.resource);
    return res.status(200).json({ success: true, message: 'Product archived', product });
  } catch (err) {
    if (err instanceof ProductError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { list, getById, create, update, remove };