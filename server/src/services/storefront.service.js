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

  const [store, categories, featured] = await Promise.all([
    Store.findOne({ brandId, isActive: true }),
    Category.find({ brandId, isActive: true }).sort({ name: 1 }),
    Product.find({ brandId, status: 'ACTIVE', isActive: true })
      .sort({ createdAt: -1 })
      .limit(FEATURED_LIMIT),
  ]);

  return {
    brand,
    store,
    categories: buildCategoryTree(categories),
    featuredProducts: await withAvailability(featured),
  };
}

module.exports = { getBrandStorefront, StorefrontError, FEATURED_LIMIT };
