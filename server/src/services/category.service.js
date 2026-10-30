const Category = require('../models/category.model');
const Product = require('../models/product.model');
const { slugify } = require('../utils/slugify');

class CategoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SORT = { order: 1, name: 1 };

/**
 * Public category listing (docs/05 §11). Categories are global now, so there is
 * no brand filter. Always active-only for public callers.
 */
async function listPublicCategories({ parentId } = {}) {
  const filter = { isActive: true };
  if (parentId) {
    filter.parentId = parentId;
  }
  return Category.find(filter).sort(SORT);
}

/**
 * Flat list -> nested tree via `parentId`. Nodes whose parent is missing (e.g.
 * the parent is inactive) are dropped, and a parentId cycle leaves both
 * unreachable from any root, so it can never loop forever.
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

async function getPublicCategoryTree() {
  const categories = await Category.find({ isActive: true }).sort(SORT);
  return buildCategoryTree(categories);
}

/**
 * Public single-category fetch. A non-active category is never revealed (404).
 */
async function getPublicCategoryById(id) {
  const category = await Category.findOne({ _id: id, isActive: true });
  if (!category) {
    throw new CategoryError(404, 'Category not found.');
  }
  return category;
}

/**
 * Raw fetch by id, no isActive filter, so an admin can load an inactive
 * category too (for example to reactivate it).
 */
async function getCategoryByIdRaw(id) {
  return Category.findById(id);
}

/**
 * A parent must exist and be a TOP-LEVEL category: the tree is two levels deep.
 */
async function assertValidParent(parentId) {
  const parent = await Category.findById(parentId);
  if (!parent) {
    throw new CategoryError(400, 'Invalid parentId — parent category not found.');
  }
  if (parent.parentId) {
    throw new CategoryError(400, 'Categories can only be two levels deep. Choose a top-level category as the parent.');
  }
  return parent;
}

async function assertSlugFree(parentId, slug, exceptId) {
  const existing = await Category.findOne({ parentId: parentId || null, slug });
  if (existing && String(existing._id) !== String(exceptId || '')) {
    throw new CategoryError(409, 'A category with this name already exists here.');
  }
}

/**
 * Creates a global category (super admin or a partner with admin.catalog).
 */
async function createCategory(data) {
  if (data.parentId) {
    await assertValidParent(data.parentId);
  }

  const slug = slugify(data.name);
  await assertSlugFree(data.parentId, slug);

  try {
    return await Category.create({ ...data, parentId: data.parentId || null, slug });
  } catch (err) {
    if (err.code === 11000) {
      throw new CategoryError(409, 'A category with this name already exists here.');
    }
    throw err;
  }
}

/**
 * True when anything still depends on the category: subcategories or products.
 */
async function hasDependents(category) {
  const [childCount, productCount] = await Promise.all([
    Category.countDocuments({ parentId: category._id }),
    Product.countDocuments({ categoryId: category._id }),
  ]);
  return childCount > 0 || productCount > 0;
}

/**
 * Applies an update. `category` was loaded by the controller. `data` is limited
 * by validators/category.validator.js; slug is never among the allowed fields.
 */
async function applyCategoryUpdate(category, data) {
  if (data.parentId !== undefined && String(data.parentId || '') !== String(category.parentId || '')) {
    if (data.parentId) {
      if (data.parentId === category._id.toString()) {
        throw new CategoryError(400, 'A category cannot be its own parent.');
      }
      await assertValidParent(data.parentId);
      // A category that has subcategories cannot become a subcategory itself.
      const childCount = await Category.countDocuments({ parentId: category._id });
      if (childCount > 0) {
        throw new CategoryError(400, 'A category with subcategories cannot be moved under another category.');
      }
    }
    await assertSlugFree(data.parentId, category.slug, category._id);
  }

  if (data.isActive === false && category.isActive !== false && (await hasDependents(category))) {
    throw new CategoryError(
      409,
      'Cannot deactivate a category that still has subcategories or products. Reassign them first.'
    );
  }

  Object.assign(category, data);
  return category.save();
}

/**
 * Deactivates a category (soft delete). Refuses with 409 while any product or
 * subcategory still references it.
 */
async function deactivateCategory(category) {
  if (await hasDependents(category)) {
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
