const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Brand = require('../models/brand.model');
const { slugify } = require('../utils/slugify');
const { escapeRegex } = require('../utils/escapeRegex');
const { getAvailabilityMap } = require('./inventory.service');

class ProductError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Public product listing, per docs/05-api-specification.md §12 (List
 * Products) and §24-25 (query parameters, pagination response).
 *
 * "Public users should normally receive only active products": the
 * default is status ACTIVE. An explicit ?status= is honored (same
 * judgment call as Brand/Category), but isActive:true is ALWAYS
 * enforced — there is no documented query parameter to reveal an
 * isActive:false product publicly.
 *
 * cityId: Product has no cityId field (city belongs to Brand), so it is
 * resolved to the brands in that city. An explicit brandId takes
 * precedence over cityId.
 */
/**
 * Adds `availability` (IN_STOCK | LOW_STOCK | OUT_OF_STOCK) to public
 * product results using ONE inventory query for the whole page.
 */
async function withAvailability(products) {
  if (products.length === 0) {
    return [];
  }
  const map = await getAvailabilityMap(products.map((p) => p._id));
  return products.map((p) => ({
    ...(typeof p.toObject === 'function' ? p.toObject() : p),
    availability: map.get(String(p._id)) || 'OUT_OF_STOCK',
  }));
}

async function listPublicProducts({
  cityId,
  brandId,
  categoryId,
  search,
  minPrice,
  maxPrice,
  page,
  limit,
  sort,
  order,
} = {}) {
  // Public users only ever see ACTIVE + isActive products (hardening
  // pass: the old ?status= override exposed DRAFT/INACTIVE products).
  const filter = { isActive: true, status: 'ACTIVE' };

  // Products of PENDING/SUSPENDED/REJECTED brands are never public. An
  // explicit brandId and/or cityId only NARROWS the set of ACTIVE brands.
  const brandFilter = { status: 'ACTIVE' };
  if (brandId) {
    brandFilter._id = brandId;
  }
  if (cityId) {
    brandFilter.cityId = cityId;
  }
  const activeBrands = await Brand.find(brandFilter, '_id');
  filter.brandId = { $in: activeBrands.map((brand) => brand._id) };

  if (categoryId) {
    filter.categoryId = categoryId;
  }
  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) {
      filter.price.$gte = minPrice;
    }
    if (maxPrice !== undefined) {
      filter.price.$lte = maxPrice;
    }
  }

  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = limit || DEFAULT_LIMIT;
  // `sort` is always one of the fixed allow-list enforced by
  // validators/product.validator.js, never a raw client string.
  const sortField = sort || 'createdAt';
  const sortDirection = order === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Product.countDocuments(filter),
  ]);

  return {
    items: await withAvailability(items),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
  };
}

/**
 * Public single-product fetch — only an active, published product is
 * ever returned (docs/05 §12: "Public if the product is active").
 */
async function getPublicProductById(id) {
  const product = await Product.findOne({ _id: id, status: 'ACTIVE', isActive: true });
  if (!product) {
    throw new ProductError(404, 'Product not found.');
  }
  // A product is only public while its brand is ACTIVE.
  const brand = await Brand.findOne({ _id: product.brandId, status: 'ACTIVE' });
  if (!brand) {
    throw new ProductError(404, 'Product not found.');
  }
  return (await withAvailability([product]))[0];
}

/**
 * Raw fetch by id, no status filtering — for requireBrandOwnership's
 * fetch callback on PATCH/DELETE (an owner must be able to load a DRAFT
 * or ARCHIVED product to edit or restore it).
 */
async function getProductByIdRaw(id) {
  return Product.findById(id);
}

/**
 * docs/04 §35 rule 3: "Product and category brand IDs must match."
 * A product may only reference a category belonging to the same brand.
 * A missing category and a cross-brand category are reported
 * identically, so the response never confirms that a category exists in
 * another tenant.
 */
async function assertCategoryBelongsToBrand(categoryId, brandId) {
  const category = await Category.findById(categoryId);
  if (!category || category.brandId.toString() !== brandId.toString()) {
    throw new ProductError(400, 'Invalid categoryId — category not found in your brand.');
  }
}

/**
 * Creates a product. `brandId` is ALWAYS supplied by the caller from
 * req.tenantBrandId (derived from the authenticated user) — never from
 * the request body. Slug uniqueness is scoped per brand.
 */
async function createProduct(brandId, data) {
  await assertCategoryBelongsToBrand(data.categoryId, brandId);

  const slug = slugify(data.name);
  const existing = await Product.findOne({ brandId, slug });
  if (existing) {
    throw new ProductError(409, 'A product with this name already exists for your brand.');
  }

  try {
    return await Product.create({ ...data, brandId, slug });
  } catch (err) {
    if (err.code === 11000) {
      throw new ProductError(409, 'A product with this name already exists for your brand.');
    }
    throw err;
  }
}

/**
 * Applies a product update. `product` is already loaded and
 * ownership-verified by requireBrandOwnership. brandId is never among
 * the allowed fields (validators/product.validator.js), and a changed
 * categoryId is re-validated against the product's OWN brand.
 */
async function applyProductUpdate(product, data) {
  if (data.categoryId) {
    await assertCategoryBelongsToBrand(data.categoryId, product.brandId);
  }

  Object.assign(product, data);
  return product.save();
}

/**
 * Archives a product (soft delete), per docs/04 §36 ("Product →
 * ARCHIVED") and docs/05 §12 ("Archiving/deactivation should generally
 * be preferred over permanent deletion").
 */
async function archiveProduct(product) {
  product.status = 'ARCHIVED';
  product.isActive = false;
  return product.save();
}

module.exports = {
  withAvailability,
  listPublicProducts,
  getPublicProductById,
  getProductByIdRaw,
  createProduct,
  applyProductUpdate,
  archiveProduct,
  ProductError,
};