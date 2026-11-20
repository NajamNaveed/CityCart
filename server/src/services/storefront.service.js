const Brand = require('../models/brand.model');
const Store = require('../models/store.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const { buildCategoryTree } = require('./category.service');
const { withAvailability } = require('./product.service');
const { toPublicBrand } = require('./brand.service');

const FEATURED_LIMIT = 8;
// A shelf is a scrolling row on the store page; 30 covers a full catalogue
// without turning one brand's products into a multi-hundred-item payload.
const SHELF_LIMIT = 30;

// Only the fields the public store page renders — never descriptions, SKUs,
// branch targeting or other internal listing data.
const SHELF_FIELDS = 'name slug categoryId images price compareAtPrice';

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
 * One horizontal row per category. Products are already newest-first, so each
 * shelf keeps the newest items; `count` stays the full shelf size so the page
 * can say "31 items" even when it only receives SHELF_LIMIT of them.
 * Products whose category is missing (e.g. deactivated) share a final
 * "More from this store" shelf instead of one unnamed shelf per category.
 */
function buildShelves(products, categories) {
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));
  const shelves = new Map();
  const orderById = new Map();
  const uncategorised = [];

  for (const product of products) {
    const category = categoryById.get(String(product.categoryId));
    if (!category) {
      uncategorised.push(product);
      continue;
    }
    const key = String(category._id);
    if (!shelves.has(key)) {
      shelves.set(key, { categoryId: category._id, name: category.name, count: 0, products: [] });
      orderById.set(key, category.order ?? 0);
    }
    const shelf = shelves.get(key);
    shelf.count += 1;
    if (shelf.products.length < SHELF_LIMIT) shelf.products.push(product);
  }

  const ordered = [...shelves.values()].sort(
    (a, b) =>
      orderById.get(String(a.categoryId)) - orderById.get(String(b.categoryId)) || a.name.localeCompare(b.name),
  );
  if (uncategorised.length > 0) {
    ordered.push({
      categoryId: null,
      name: 'More from this store',
      count: uncategorised.length,
      products: uncategorised.slice(0, SHELF_LIMIT),
    });
  }
  return ordered;
}

/**
 * Public brand storefront (docs/07 §7): header (brand), store info,
 * categories, featured products, category shelves. "All products" is the
 * existing GET /products?brandId=. Everything is scoped to this one brand, so
 * a storefront can never show another brand's products, and a non-ACTIVE
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

  const [store, usedCategoryIds, products] = await Promise.all([
    Store.findOne({ brandId, isActive: true }),
    Product.distinct('categoryId', { brandId, status: 'ACTIVE', isActive: true }),
    Product.find({ brandId, status: 'ACTIVE', isActive: true })
      .select(SHELF_FIELDS)
      .sort({ createdAt: -1 }),
  ]);
  const categories = await categoriesWithParents(usedCategoryIds);
  const withStock = await withAvailability(products);

  return {
    brand: toPublicBrand(brand),
    store,
    categories: buildCategoryTree(categories),
    featuredProducts: withStock.slice(0, FEATURED_LIMIT),
    shelves: buildShelves(withStock, categories),
  };
}

module.exports = { getBrandStorefront, buildShelves, StorefrontError, FEATURED_LIMIT, SHELF_LIMIT };
