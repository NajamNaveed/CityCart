const Category = require('../models/category.model');
const Product = require('../models/product.model');
const Brand = require('../models/brand.model');
const { slugify } = require('../utils/slugify');

class CategoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Public category listing, per docs/05-api-specification.md §11 ("Public
 * users may retrieve active categories"). Mirrors the Brand list
 * precedent (services/brand.service.js): the default is active-only, but
 * an explicit ?isActive= override is honored. Same judgment call, flagged
 * in the Phase 7 report.
 */
async function listPublicCategories({ brandId, parentId } = {}) {
  const filter = {};

  // Categories of PENDING/SUSPENDED/REJECTED brands are never public.
  // brandId only NARROWS the set of ACTIVE brands.
  const activeBrands = await Brand.find(
    { status: 'ACTIVE', ...(brandId && { _id: brandId }) },
    '_id'
  );
  filter.brandId = { $in: activeBrands.map((b) => b._id) };
  if (parentId) {
    filter.parentId = parentId;
  }
  // Always active-only for public callers (hardening pass: the old
  // ?isActive=false override exposed deactivated categories).
  filter.isActive = true;

  return Category.find(filter).sort({ name: 1 });
}

/**
 * Flat list -> nested tree via `parentId`. Nodes whose parent is missing
 * (e.g. the parent is inactive) are dropped, and a parentId cycle (A<->B)
 * leaves both unreachable from any root — so it can never loop forever.
 */
function buildCategoryTree(categories) {
  const nodes = new Map(
    categories.map((c) => [
      String(c._id),
      { ...(typeof c.toObject === 'function' ? c.toObject() : c), children: [] },
    ])
  );
  const roots = [];
  nodes.forEach((node) => {
    if (!node.parentId) {
      roots.push(node);
      return;
    }
    const parent = nodes.get(String(node.parentId));
    if (parent) {
      parent.children.push(node);
    }
  });
  return roots;
}

async function getPublicCategoryTree(brandId) {
  const brand = await Brand.findOne({ _id: brandId, status: 'ACTIVE' });
  if (!brand) {
    throw new CategoryError(404, 'Brand not found.');
  }
  const categories = await Category.find({ brandId, isActive: true }).sort({ name: 1 });
  return buildCategoryTree(categories);
}

/**
 * Public single-category fetch. A non-active category is never revealed
 * here (404), same hide-rather-than-403 pattern as Brand/Store.
 */
async function getPublicCategoryById(id) {
  const category = await Category.findOne({ _id: id, isActive: true });
  if (!category) {
    throw new CategoryError(404, 'Category not found.');
  }
  return category;
}

/**
 * Raw fetch by id, no isActive filter — for requireBrandOwnership's
 * fetch callback on PATCH/DELETE, which must be able to load an inactive
 * category too (e.g. to reactivate it).
 */
async function getCategoryByIdRaw(id) {
  return Category.findById(id);
}

/**
 * Creates a category. `brandId` is ALWAYS supplied by the caller from
 * req.tenantBrandId (derived from the authenticated user by
 * requireTenant) — never from the request body (AGENTS.md §9; docs/05
 * §11 — "The server determines the user's brand").
 *
 * If parentId is given, the parent must exist AND belong to the same
 * brand (docs/07 §11 — brand categories "must remain inside their
 * brand's tenant boundary"; docs/04 §35 rule 3).
 *
 * Slug uniqueness is scoped per brand ({brandId, slug}) — two different
 * brands may each have a category named "Phones".
 */
async function createCategory(brandId, data) {
  if (data.parentId) {
    const parent = await Category.findById(data.parentId);
    if (!parent || parent.brandId.toString() !== brandId.toString()) {
      throw new CategoryError(400, 'Invalid parentId — parent category not found in your brand.');
    }
  }

  const slug = slugify(data.name);
  const existing = await Category.findOne({ brandId, slug });
  if (existing) {
    throw new CategoryError(409, 'A category with this name already exists for your brand.');
  }

  try {
    return await Category.create({ ...data, brandId, slug });
  } catch (err) {
    if (err.code === 11000) {
      throw new CategoryError(409, 'A category with this name already exists for your brand.');
    }
    throw err;
  }
}

/**
 * Applies a category update. `category` is expected to already be loaded
 * and ownership-verified by requireBrandOwnership (routes/category.routes.js).
 * `data` is restricted by validators/category.validator.js — brandId and
 * slug are never among the allowed fields.
 */
async function applyCategoryUpdate(category, data) {
  if (data.parentId) {
    if (data.parentId === category._id.toString()) {
      throw new CategoryError(400, 'A category cannot be its own parent.');
    }
    const parent = await Category.findById(data.parentId);
    if (!parent || parent.brandId.toString() !== category.brandId.toString()) {
      throw new CategoryError(400, 'Invalid parentId — parent category not found in your brand.');
    }
  }

  Object.assign(category, data);
  return category.save();
}

/**
 * Deactivates a category (soft delete), per docs/04 §36 and docs/05 §11
 * ("check whether products or child categories depend on the category
 * before deleting it"). Refuses with 409 while any product or
 * subcategory still references it.
 */
async function deactivateCategory(category) {
  const [childCount, productCount] = await Promise.all([
    Category.countDocuments({ parentId: category._id }),
    Product.countDocuments({ categoryId: category._id }),
  ]);

  if (childCount > 0 || productCount > 0) {
    throw new CategoryError(
      409,
      'Cannot delete a category that still has subcategories or products. Reassign them first.'
    );
  }

  category.isActive = false;
  return category.save();
}

module.exports = {
  buildCategoryTree,
  getPublicCategoryTree,
  listPublicCategories,
  getPublicCategoryById,
  getCategoryByIdRaw,
  createCategory,
  applyCategoryUpdate,
  deactivateCategory,
  CategoryError,
};