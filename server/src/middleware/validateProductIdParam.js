const { productIdParamSchema } = require('../validators/inventory.validator');
const { formatZodError } = require('../utils/formatZodError');

/**
 * Validates the `:productId` route param as a Mongo ObjectId BEFORE
 * requireBrandOwnership fetches the product by it — same reason (and same
 * 400 response) as validateObjectIdParam.js, which only reads `:id`.
 * Inventory routes are keyed by `:productId` (docs/05 §13), so they need
 * their own guard; otherwise an invalid id reaches Model.findById() as an
 * uncaught CastError and becomes a 500.
 */
function validateProductIdParam(req, res, next) {
  const parsed = productIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }
  return next();
}

module.exports = validateProductIdParam;