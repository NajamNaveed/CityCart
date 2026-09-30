const { updateStoreSchema, createStoreSchema } = require('../validators/store.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  getPublicStoreById,
  getMyStore,
  applyStoreUpdate,
  StoreError,
  createStore,
} = require('../services/store.service');
const { formatZodError } = require('../utils/formatZodError');

async function create(req, res, next) {
  const parsed = createStoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }

  // Tenant users: brand comes from the token, body brandId is ignored.
  // SUPER_ADMIN has no tenant, so must name the brand explicitly.
  const brandId = req.tenantBrandId || parsed.data.brandId;
  if (!brandId) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: [{ field: 'brandId', message: 'brandId is required for SUPER_ADMIN' }],
    });
  }

  try {
    const store = await createStore(brandId, parsed.data);
    return res.status(201).json({ success: true, message: 'Store created', store });
  } catch (err) {
    if (err instanceof StoreError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
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
    const store = await getPublicStoreById(parsedParams.data.id);
    return res.status(200).json({ success: true, store });
  } catch (err) {
    if (err instanceof StoreError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    // req.tenantBrandId is set by requireTenant from req.user.brandId —
    // never from client input (docs/05 §10).
    const store = await getMyStore(req.tenantBrandId);
    return res.status(200).json({ success: true, store });
  } catch (err) {
    if (err instanceof StoreError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  const parsedParams = objectIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedParams.error),
    });
  }

  const parsedBody = updateStoreSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    // req.resource was already loaded and brand-ownership-verified by
    // requireBrandOwnership (routes/store.routes.js).
    const store = await applyStoreUpdate(req.resource, parsedBody.data);
    return res.status(200).json({ success: true, message: 'Store updated', store });
  } catch (err) {
    if (err instanceof StoreError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

module.exports = { getById, me, update, create };