const {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
} = require('../validators/category.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  getPublicCategoryTree,
  listPublicCategories,
  getPublicCategoryById,
  getCategoryByIdRaw,
  createCategory,
  applyCategoryUpdate,
  deactivateCategory,
  CategoryError,
} = require('../services/category.service');
const { formatZodError } = require('../utils/formatZodError');

async function list(req, res, next) {
  const parsedQuery = listCategoriesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  try {
    const categories = await listPublicCategories(parsedQuery.data);
    return res.status(200).json({ success: true, categories });
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
    const category = await getPublicCategoryById(parsedParams.data.id);
    return res.status(200).json({ success: true, category });
  } catch (err) {
    if (err instanceof CategoryError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function create(req, res, next) {
  const parsedBody = createCategorySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const category = await createCategory(parsedBody.data);
    return res.status(201).json({ success: true, message: 'Category created', category });
  } catch (err) {
    if (err instanceof CategoryError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const parsedBody = updateCategorySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const existing = await getCategoryByIdRaw(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    const category = await applyCategoryUpdate(existing, parsedBody.data);
    return res.status(200).json({ success: true, message: 'Category updated', category });
  } catch (err) {
    if (err instanceof CategoryError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const existing = await getCategoryByIdRaw(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    const category = await deactivateCategory(existing);
    return res.status(200).json({ success: true, message: 'Category deactivated', category });
  } catch (err) {
    if (err instanceof CategoryError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function tree(req, res, next) {
  try {
    const categories = await getPublicCategoryTree();
    return res.status(200).json({ success: true, categories });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  tree, list, getById, create, update, remove };