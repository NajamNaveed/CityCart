const { objectIdParamSchema } = require('../validators/common.validator');
const { formatZodError } = require('../utils/formatZodError');

/**
 * Validates the `:id` route param as a Mongo ObjectId BEFORE any
 * downstream middleware (e.g. requireBrandOwnership) tries to fetch it
 * by that id.
 *
 * Every existing GET /:id controller (City, Brand, Store) already does
 * this validation itself, inline, before calling its service — but the
 * Phase 6 PATCH routes (brand.routes.js, store.routes.js) never added
 * an equivalent guard, because requireBrandOwnership's fetchResource
 * callback calls Model.findById(req.params.id) directly. An invalid
 * (non-ObjectId) id there throws a Mongoose CastError that is caught by
 * requireBrandOwnership's try/catch and passed to next(err) — which,
 * with no CastError-aware error handler registered in app.js, becomes
 * an uncaught 500 rather than a clean 400.
 *
 * This went unnoticed in Phase 6 because no Phase 6 test exercised an
 * invalid id against a PATCH route. Phase 7's spec explicitly requires
 * an "invalid category/product ID" test for the PATCH and DELETE
 * routes, so this gap needed closing here. It is used only on the new
 * Category/Product PATCH/DELETE routes — Brand/Store are left
 * unchanged, since touching Phase 6 files wasn't required for Phase 7
 * itself. This is flagged as a pre-existing Phase 6 gap in the Phase 7
 * report rather than silently fixed everywhere.
 */
function validateObjectIdParam(req, res, next) {
  const parsed = objectIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: formatZodError(parsed.error),
    });
  }
  return next();
}

module.exports = validateObjectIdParam;