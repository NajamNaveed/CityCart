const Brand = require('../models/brand.model');
const Store = require('../models/store.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const { buildCategoryTree } = require('./category.service');
const { withAvailability } = require('./product.service');

const FEATURED_LIMIT = 8;

class StorefrontError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * The global categories this brand actually sells in, plus their parents, so the
 * storefront shows a small tree instead of the whole platform tree.
 */
async function categoriesWithParents(ids) {
  if (!ids || ids.length === 0) return [];
  const used = await Category.find({ _id: { $in: ids }, isActive: true }).sort({ order: 1, name: 1 });
  const parentIds = [...new Set(used.filter((c) => c.parentId).map((c) => String(c.parentId)))];
  const parents = parentIds.length
    ? await Category.find({ _id: { $in: parentIds }, isActive: true }).sort({ order: 1, name: 1 })
    : [];
  const seen = new Set();
  return [...parents, ...used].filter((c) => {
    const key = String(c._id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Public brand storefront (docs/07 §7): header (brand), store info,
 * categories, featured products. "All products" is the existing
 * GET /products?brandId=. Everything is scoped to this one brand, so a
 * storefront can never show another brand's products, and a non-ACTIVE
 * brand is a 404.
 *
 * There is no `featured` flag in the schema yet, so "featured" = the
 * newest ACTIVE products. Swap in a real flag later without changing
 * this response shape.
 */
async function getBrandStorefront(brandId) {
  const brand = await Brand.findOne({ _id: brandId, status: 'ACTIVE' });
  if (!brand) {
    throw new StorefrontError(404, 'Brand not found.');
  }

  const [store, usedCategoryIds, featured] = await Promise.all([
    Store.findOne({ brandId, isActive: true }),
    Product.distinct('categoryId', { brandId, status: 'ACTIVE', isActive: true }),
    Product.find({ brandId, status: 'ACTIVE', isActive: true })
      .sort({ createdAt: -1 })
      .limit(FEATURED_LIMIT),
  ]);
  const categories = await categoriesWithParents(usedCategoryIds);

  return {
    brand,
    store,
    categories: buildCategoryTree(categories),
    featuredProducts: await withAvailability(featured),
  };
}

module.exports = { getBrandStorefront, StorefrontError, FEATURED_LIMIT };
