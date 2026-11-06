const ServiceCategory = require('../models/serviceCategory.model');
const ServiceProvider = require('../models/serviceProvider.model');
const { slugify } = require('../utils/slugify');

class ServiceCategoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SORT = { order: 1, name: 1 };

async function assertValidParent(parentId, selfId) {
  if (parentId === undefined || parentId === null) return null;
  if (selfId && String(parentId) === String(selfId)) {
    throw new ServiceCategoryError(400, 'A category cannot be its own parent.');
  }
  const parent = await ServiceCategory.findById(parentId);
  if (!parent) throw new ServiceCategoryError(400, 'Invalid parentId — category not found.');
  if (parent.parentId) {
    throw new ServiceCategoryError(
      400,
      'Service categories can only be two levels deep. Choose a top-level category as the parent.'
    );
  }
  return parent;
}

async function assertSlugFree(slug, exceptId) {
  const existing = await ServiceCategory.findOne({ slug });
  if (existing && String(existing._id) !== String(exceptId || '')) {
    throw new ServiceCategoryError(409, 'A service category with this name already exists.');
  }
}

/**
 * Admin listing: every category, active or not, with how many providers use it.
 * The public endpoint only returns active rows (docs/05 §22g).
 */
async function listCategoriesForAdmin() {
  const [categories, counts] = await Promise.all([
    ServiceCategory.find({}).sort(SORT),
    ServiceProvider.aggregate([{ $group: { _id: '$categoryId', count: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));
  return categories.map((category) => ({
    _id: category._id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    order: category.order,
    image: category.image,
    isActive: category.isActive,
    providerCount: countById.get(String(category._id)) || 0,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }));
}

async function createServiceCategory(data) {
  await assertValidParent(data.parentId);

  const slug = slugify(data.name);
  if (!slug) throw new ServiceCategoryError(400, 'Name must contain letters or numbers.');
  await assertSlugFree(slug);

  try {
    const category = await ServiceCategory.create({
      name: data.name,
      slug,
      parentId: data.parentId || null,
      order: data.order || 0,
      image: data.image,
      isActive: data.isActive !== false,
    });
    return category;
  } catch (err) {
    if (err.code === 11000) {
      throw new ServiceCategoryError(409, 'A service category with this name already exists.');
    }
    throw err;
  }
}

/** A category can be deactivated only when nothing depends on it. */
async function assertNotInUse(category) {
  const [providerCount, childCount] = await Promise.all([
    ServiceProvider.countDocuments({ categoryId: category._id }),
    ServiceCategory.countDocuments({ parentId: category._id }),
  ]);
  if (providerCount > 0 || childCount > 0) {
    throw new ServiceCategoryError(
      409,
      'This category still has providers or subcategories. Move them first.'
    );
  }
}

async function updateServiceCategory(id, data) {
  const category = await ServiceCategory.findById(id);
  if (!category) throw new ServiceCategoryError(404, 'Service category not found.');

  if (data.parentId !== undefined && String(data.parentId || '') !== String(category.parentId || '')) {
    await assertValidParent(data.parentId, category._id);
    const childCount = await ServiceCategory.countDocuments({ parentId: category._id });
    if (childCount > 0) {
      throw new ServiceCategoryError(
        400,
        'A category with subcategories cannot be moved under another category.'
      );
    }
  }

  if (data.isActive === false && category.isActive !== false) {
    await assertNotInUse(category);
  }

  for (const key of ['name', 'parentId', 'order', 'image', 'isActive']) {
    if (data[key] !== undefined) category[key] = data[key];
  }
  await category.save();
  return category;
}

/** Soft delete. History and provider references are never rewritten. */
async function deactivateServiceCategory(id) {
  const category = await ServiceCategory.findById(id);
  if (!category) throw new ServiceCategoryError(404, 'Service category not found.');
  if (category.isActive) {
    await assertNotInUse(category);
    category.isActive = false;
    await category.save();
  }
  return category;
}

module.exports = {
  ServiceCategoryError,
  listCategoriesForAdmin,
  createServiceCategory,
  updateServiceCategory,
  deactivateServiceCategory,
};
