const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  listMyProductsQuerySchema,
} = require('../validators/product.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listPublicProducts,
  listBrandProducts,
  getPublicProductById,
  createProduct,
  applyProductUpdate,
  archiveProduct,
  ProductError,
} = require('../services/product.service');
const { getInventoryForProduct, serializeInventory } = require('../services/inventory.service');
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

// GET /products/mine — the caller's own products, every status.
async function mine(req, res, next) {
  const parsedQuery = listMyProductsQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  // A super admin has no brand of their own, so there is nothing to list.
  if (!req.tenantBrandId) {
    return res
      .status(403)
      .json({ success: false, message: 'You are not authorized to perform this action.' });
  }

  try {
    const { items, pagination } = await listBrandProducts(req.tenantBrandId, parsedQuery.data);
    return res.status(200).json({ success: true, products: items, pagination });
  } catch (err) {
    return next(err);
  }
}

// GET /products/mine/:id — one of the caller's own products in ANY status, with its inventory.
// req.resource was loaded and brand-ownership-verified by requireBrandOwnership.
async function mineById(req, res, next) {
  try {
    const inventory = await getInventoryForProduct(req.resource);
    return res.status(200).json({
      success: true,
      product: req.resource,
      inventory: serializeInventory(inventory),
    });
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

module.exports = { list, mine, mineById, getById, create, update, remove };