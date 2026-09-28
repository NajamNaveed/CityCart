const {
  updateInventorySchema,
  adjustInventorySchema,
  listInventoryQuerySchema,
} = require('../validators/inventory.validator');
const {
  listInventory,
  getInventoryForProduct,
  updateInventory,
  adjustStock,
  serializeInventory,
  InventoryError,
} = require('../services/inventory.service');
const { formatZodError } = require('../utils/formatZodError');

function sendError(err, res, next) {
  if (err instanceof InventoryError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

async function list(req, res, next) {
  const parsedQuery = listInventoryQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedQuery.error),
    });
  }

  try {
    // Brand users are ALWAYS scoped to their own brand: req.tenantBrandId
    // comes from requireTenant (req.user.brandId), and a ?brandId= they
    // send is ignored. Only SUPER_ADMIN (tenantBrandId === null) may
    // narrow the platform-wide list with ?brandId=.
    const brandId = req.tenantBrandId || parsedQuery.data.brandId;

    const { items, pagination } = await listInventory({
      brandId,
      stockStatus: parsedQuery.data.stockStatus,
      page: parsedQuery.data.page,
      limit: parsedQuery.data.limit,
    });
    return res.status(200).json({
      success: true,
      inventories: items.map(serializeInventory),
      pagination,
    });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function getByProduct(req, res, next) {
  try {
    // req.resource is the Product, loaded and brand-ownership-verified by
    // requireBrandOwnership (routes/inventory.routes.js).
    const inventory = await getInventoryForProduct(req.resource);
    return res.status(200).json({ success: true, inventory: serializeInventory(inventory) });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function update(req, res, next) {
  const parsedBody = updateInventorySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    const inventory = await updateInventory(req.resource, parsedBody.data);
    return res
      .status(200)
      .json({ success: true, message: 'Inventory updated', inventory: serializeInventory(inventory) });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function adjust(req, res, next) {
  const parsedBody = adjustInventorySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsedBody.error),
    });
  }

  try {
    // The acting user for the adjustment record is always req.user — a
    // userId in the request body is never read.
    const { inventory, adjustment } = await adjustStock(req.resource, {
      change: parsedBody.data.change,
      reason: parsedBody.data.reason,
      userId: req.user._id,
    });
    return res.status(200).json({
      success: true,
      message: 'Inventory adjusted',
      inventory: serializeInventory(inventory),
      adjustment,
    });
  } catch (err) {
    return sendError(err, res, next);
  }
}

module.exports = { list, getByProduct, update, adjust };