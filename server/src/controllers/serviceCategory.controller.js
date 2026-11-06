const {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  serviceCategoryIdParamSchema,
} = require('../validators/serviceCategory.validator');
const {
  listCategoriesForAdmin,
  createServiceCategory,
  updateServiceCategory,
  deactivateServiceCategory,
  ServiceCategoryError,
} = require('../services/serviceCategory.service');
const { recordAdminAction } = require('../services/adminAction.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceCategoryError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

async function list(req, res, next) {
  try {
    return res.status(200).json({ success: true, categories: await listCategoriesForAdmin() });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function create(req, res, next) {
  const parsed = createServiceCategorySchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const category = await createServiceCategory(parsed.data);
    await recordAdminAction({
      actor: req.user,
      action: 'serviceCategory.created',
      target: { type: 'ServiceCategory', id: category._id, label: category.name },
    });
    return res.status(201).json({ success: true, message: 'Service category added.', category });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = serviceCategoryIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const parsed = updateServiceCategorySchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const category = await updateServiceCategory(params.data.id, parsed.data);
    await recordAdminAction({
      actor: req.user,
      action: 'serviceCategory.updated',
      target: { type: 'ServiceCategory', id: category._id, label: category.name },
    });
    return res.status(200).json({ success: true, message: 'Service category updated.', category });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function remove(req, res, next) {
  const params = serviceCategoryIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    const category = await deactivateServiceCategory(params.data.id);
    await recordAdminAction({
      actor: req.user,
      action: 'serviceCategory.deactivated',
      target: { type: 'ServiceCategory', id: category._id, label: category.name },
    });
    return res.status(200).json({ success: true, message: 'Service category deactivated.', category });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, create, update, remove };
