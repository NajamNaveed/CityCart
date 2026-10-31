const {
  createCatalogSchema,
  requestCatalogSchema,
  updateCatalogSchema,
  rejectCatalogSchema,
  mergeCatalogSchema,
  listCatalogQuerySchema,
} = require('../validators/catalog.validator');
const service = require('../services/catalog.service');
const { formatZodError } = require('../utils/formatZodError');

const { CatalogError } = service;

function bad(res, error) {
  return res.status(400).json({ success: false, errors: formatZodError(error) });
}

function fail(err, res, next) {
  if (err instanceof CatalogError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

/**
 * Brand staff endpoints need a brand. A super admin has none (tenantBrandId is
 * null), so they get the same answers the product endpoints give: 403 when
 * reading, 400 when creating.
 */
function noBrand(req, res, status) {
  if (req.tenantBrandId) return false;
  const message = status === 403 ? 'You are not authorized to perform this action.' : 'A brand account is required.';
  res.status(status).json({ success: false, message, ...(status === 403 && { code: 'NO_BRAND' }) });
  return true;
}

/** Loads the item named by :id or answers 404. */
async function loadItem(req, res) {
  const item = await service.getCatalogByIdRaw(req.params.id);
  if (!item) {
    res.status(404).json({ success: false, message: 'Catalogue product not found.' });
    return null;
  }
  return item;
}

// ---- brand staff -----------------------------------------------------------

async function listForBrand(req, res, next) {
  if (noBrand(req, res, 403)) return null;
  const query = listCatalogQuerySchema.safeParse(req.query);
  if (!query.success) return bad(res, query.error);
  try {
    const result = await service.listForBrand(req.tenantBrandId, query.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function listMine(req, res, next) {
  if (noBrand(req, res, 403)) return null;
  const query = listCatalogQuerySchema.safeParse(req.query);
  if (!query.success) return bad(res, query.error);
  try {
    const result = await service.listMine(req.tenantBrandId, query.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function getForBrand(req, res, next) {
  if (noBrand(req, res, 403)) return null;
  try {
    const item = await service.getCatalogForBrand(req.tenantBrandId, req.params.id);
    return res.status(200).json({ success: true, item });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function request(req, res, next) {
  if (noBrand(req, res, 400)) return null;
  const body = requestCatalogSchema.safeParse(req.body);
  if (!body.success) return bad(res, body.error);
  try {
    const item = await service.requestCatalogProduct(req.tenantBrandId, body.data, req.user._id);
    return res.status(201).json({ success: true, item });
  } catch (err) {
    return fail(err, res, next);
  }
}

// ---- platform admins -------------------------------------------------------

async function listForAdmin(req, res, next) {
  const query = listCatalogQuerySchema.safeParse(req.query);
  if (!query.success) return bad(res, query.error);
  try {
    const result = await service.listForAdmin(query.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function create(req, res, next) {
  const body = createCatalogSchema.safeParse(req.body);
  if (!body.success) return bad(res, body.error);
  try {
    const item = await service.createCatalogProduct(body.data, req.user._id);
    return res.status(201).json({ success: true, item });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function update(req, res, next) {
  const body = updateCatalogSchema.safeParse(req.body);
  if (!body.success) return bad(res, body.error);
  try {
    const item = await loadItem(req, res);
    if (!item) return null;
    const saved = await service.updateCatalogProduct(item, body.data);
    return res.status(200).json({ success: true, item: saved });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function approve(req, res, next) {
  try {
    const item = await loadItem(req, res);
    if (!item) return null;
    const saved = await service.approveCatalogProduct(item, req.user._id);
    return res.status(200).json({ success: true, item: saved });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function reject(req, res, next) {
  const body = rejectCatalogSchema.safeParse(req.body);
  if (!body.success) return bad(res, body.error);
  try {
    const item = await loadItem(req, res);
    if (!item) return null;
    const saved = await service.rejectCatalogProduct(item, body.data.note, req.user._id);
    return res.status(200).json({ success: true, item: saved });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function merge(req, res, next) {
  const body = mergeCatalogSchema.safeParse(req.body);
  if (!body.success) return bad(res, body.error);
  try {
    const from = await loadItem(req, res);
    if (!from) return null;
    const into = await service.getCatalogByIdRaw(body.data.intoId);
    if (!into) {
      return res.status(404).json({ success: false, message: 'The item to merge into was not found.' });
    }
    const saved = await service.mergeCatalogProducts(from, into);
    return res.status(200).json({ success: true, item: saved });
  } catch (err) {
    return fail(err, res, next);
  }
}

async function remove(req, res, next) {
  try {
    const item = await loadItem(req, res);
    if (!item) return null;
    const saved = await service.archiveCatalogProduct(item);
    return res.status(200).json({ success: true, item: saved });
  } catch (err) {
    return fail(err, res, next);
  }
}

module.exports = {
  listForBrand,
  listMine,
  getForBrand,
  request,
  listForAdmin,
  create,
  update,
  approve,
  reject,
  merge,
  remove,
};
