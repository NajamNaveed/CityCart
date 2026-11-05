const Product = require('../models/product.model');
const CatalogProduct = require('../models/catalogProduct.model');
const { getUnusableCategoryReason } = require('./category.service');
const Brand = require('../models/brand.model');
const Branch = require('../models/branch.model');
const { slugify } = require('../utils/slugify');
const { escapeRegex } = require('../utils/escapeRegex');
const Inventory = require('../models/inventory.model');
const { getAvailabilityMap, serializeInventory } = require('./inventory.service');

class ProductError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

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
 * The brand dashboard's own product list: ALL statuses (drafts, inactive and
 * archived included), scoped to the caller's brand. brandId comes from the
 * authenticated user's tenant (req.tenantBrandId), never from the request.
 * Each item carries its inventory (quantity, reserved, available, stockStatus)
 * so the dashboard needs one request, not one per product.
 */
async function listBrandProducts(brandId, { status, search, page, limit } = {}) {
  const filter = { brandId };
  if (status) {
    filter.status = status;
  }
  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }

  const pageNumber = page || DEFAULT_PAGE;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Product.countDocuments(filter),
  ]);

  const inventories = products.length
    ? await Inventory.find({ brandId, productId: { $in: products.map((p) => p._id) } })
    : [];
  const byProduct = new Map(inventories.map((inv) => [String(inv.productId), serializeInventory(inv)]));

  return {
    items: products.map((p) => ({
      ...(typeof p.toObject === 'function' ? p.toObject() : p),
      // A product with no inventory record yet simply has no stock.
      inventory: byProduct.get(String(p._id)) || null,
    })),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber),
    },
  };
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
 * Creates a product. `brandId` is ALWAYS supplied by the caller from
 * req.tenantBrandId (derived from the authenticated user) — never from
 * the request body. Slug uniqueness is scoped per brand.
 */
/**
 * Every branch id must belong to the product's own brand (a brand can only
 * place a product in its own shops). Returns the de-duplicated list; an empty
 * list means "all branches" and needs no lookup.
 */
async function normalizeBranchIds(branchIds, brandId) {
  const unique = [...new Set((branchIds || []).map(String))];
  if (unique.length === 0) {
    return [];
  }
  const owned = await Branch.countDocuments({ _id: { $in: unique }, brandId });
  if (owned !== unique.length) {
    throw new ProductError(400, 'One or more branches do not belong to your brand.');
  }
  return unique;
}

async function createProduct(brandId, data) {
  const { catalogProductId, ...own } = data;

  // The item must be an ACTIVE catalogue item this store may use: a global one,
  // or its own private one. Anything else looks like "not found".
  const item = await CatalogProduct.findById(catalogProductId);
  const allowed =
    item &&
    item.status === 'ACTIVE' &&
    (item.scope === 'GLOBAL' || String(item.brandId) === String(brandId));
  if (!allowed) {
    throw new ProductError(400, 'Invalid catalogProductId — catalogue product not found.');
  }
  const categoryProblem = await getUnusableCategoryReason(item.categoryId);
  if (categoryProblem) {
    throw new ProductError(400, categoryProblem);
  }

  if (own.branchIds !== undefined) {
    own.branchIds = await normalizeBranchIds(own.branchIds, brandId);
  }

  // A store lists an item once. An archived listing of the same item still holds
  // the slug, so it is reported the same way.
  const slug = slugify(item.name);
  const existing =
    (await Product.findOne({ brandId, catalogProductId: item._id })) || (await Product.findOne({ brandId, slug }));
  if (existing) {
    throw new ProductError(409, 'You already list this product.');
  }

  try {
    return await Product.create({
      ...own,
      brandId,
      slug,
      catalogProductId: item._id,
      name: item.name,
      description: item.description,
      images: item.images || [],
      categoryId: item.categoryId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ProductError(409, 'You already list this product.');
    }
    throw err;
  }
}

/**
 * Applies a product update. `product` is already loaded and
 * ownership-verified by requireBrandOwnership. brandId is never among
 * the allowed fields (validators/product.validator.js). Name, description,
 * images and category belong to the catalogue item and cannot be edited here.
 */
async function applyProductUpdate(product, data) {
  if (data.branchIds !== undefined) {
    data = { ...data, branchIds: await normalizeBranchIds(data.branchIds, product.brandId) };
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
  listBrandProducts,
  getPublicProductById,
  getProductByIdRaw,
  createProduct,
  applyProductUpdate,
  archiveProduct,
  ProductError,
};