const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Brand = require('../models/brand.model');
const { slugify } = require('../utils/slugify');

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
async function listPublicProducts({
  cityId,
  brandId,
  categoryId,
  search,
  minPrice,
  maxPrice,
  status,
  page,
  limit,
  sort,
  order,
} = {}) {
  const filter = { isActive: true, status: status || 'ACTIVE' };

  if (brandId) {
    filter.brandId = brandId;
  } else if (cityId) {
    const brandsInCity = await Brand.find({ cityId }, '_id');
    filter.brandId = { $in: brandsInCity.map((brand) => brand._id) };
  }

  if (categoryId) {
    filter.categoryId = categoryId;
  }
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
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
    items,
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
  return product;
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
  listPublicProducts,
  getPublicProductById,
  getProductByIdRaw,
  createProduct,
  applyProductUpdate,
  archiveProduct,
  ProductError,
};