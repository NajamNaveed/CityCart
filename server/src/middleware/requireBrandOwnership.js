const { ROLES } = require('../config/roles');

/**
 * Resource ownership middleware factory, per
 * docs/02-user-roles-and-permissions.md §16 (Brand Isolation Rules) and
 * §17 (Ownership Checks — "Ownership must be verified server-side" via
 * `resource.brandId === req.user.brandId`).
 *
 * This is step 4 of the authorization chain (after requireTenant.js).
 * It is deliberately generic — it knows nothing about Product, Order,
 * or any other specific resource type. Callers supply a `fetchResource`
 * function that loads the document by whatever identifier the route
 * uses (typically req.params.id), and this middleware applies the
 * brand-ownership check uniformly on top of that. This is what makes it
 * reusable for Product, Order, Category, Store, Employee, Inventory,
 * Review, and any other brand-owned resource in docs/04-database-design.md
 * without duplicating the ownership check in each one.
 *
 * `fetchResource` should look the resource up BY ID ONLY (no brandId
 * filter baked into the query) — this middleware performs the brandId
 * comparison itself so it can distinguish "does not exist" (404) from
 * "exists, but belongs to another brand" (403), matching
 * docs/02 §16's own worked example (cross-brand access -> 403).
 *
 * Usage (illustrative — Product itself is not implemented in this phase):
 *   router.patch(
 *     '/products/:id',
 *     authenticate,
 *     requirePermission(PERMISSIONS.PRODUCTS_UPDATE),
 *     requireTenant,
 *     requireBrandOwnership((req) => Product.findById(req.params.id)),
 *     controller
 *   );
 *
 * On success, attaches the loaded document to `req.resource` (or the
 * key given via options.resourceKey) so the controller can reuse it
 * without a second query.
 *
 * options.resourceType:
 *   - 'owned' (default) — the resource is BRAND-OWNED (Store, Product,
 *     Category, etc.). Ownership is `resource.brandId === req.user.brandId`.
 *   - 'tenant' — the resource IS the tenant itself (Brand). Brand has no
 *     `brandId` field (it would be redundant with its own `_id`), so
 *     ownership is `resource._id === req.user.brandId` instead. Use this
 *     only for Brand routes (e.g. PATCH /api/v1/brands/:id).
 */
function requireBrandOwnership(fetchResource, options = {}) {
  const resourceKey = options.resourceKey || 'resource';
  const resourceType = options.resourceType || 'owned';

  return async function ownershipMiddleware(req, res, next) {
    try {
      if (!req.user) {
        // Defensive: see the same note in requireTenant.js.
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const resource = await fetchResource(req);

      if (!resource) {
        return res.status(404).json({ success: false, message: 'Resource not found.' });
      }

      // SUPER_ADMIN is platform-wide and bypasses brand ownership
      // entirely (docs/02 §7).
      if (req.user.role === ROLES.SUPER_ADMIN) {
        req[resourceKey] = resource;
        return next();
      }

      // CUSTOMER is not a brand-tenant user in this phase (customer
      // ownership of their own resources, e.g. their own orders, is a
      // separate mechanism, not brand-tenant authorization) — never
      // allowed through this path.
      if (req.user.role !== ROLES.BRAND_ADMIN && req.user.role !== ROLES.BRAND_EMPLOYEE) {
        return res
          .status(403)
          .json({ success: false, message: 'You are not authorized to perform this action.' });
      }

      // The authority for "which brand is this request allowed to act
      // as" is ALWAYS req.user.brandId (set by requireTenant.js from the
      // authenticated session) — never req.body.brandId,
      // req.query.brandId, or req.params.brandId. Those are never read
      // here, by design, so a client-supplied brandId can never override
      // or spoof the check.
      const userBrandId = req.user.brandId ? req.user.brandId.toString() : null;

      // For 'tenant' resources (Brand), the resource's own _id IS the
      // brand identity — Brand does not (and must not) carry a redundant
      // brandId field. For 'owned' resources (Store, Product, ...), the
      // resource is scoped by its brandId field instead.
      const resourceBrandId =
        resourceType === 'tenant'
          ? resource._id
            ? resource._id.toString()
            : null
          : resource.brandId
            ? resource.brandId.toString()
            : null;

      if (!userBrandId || resourceBrandId !== userBrandId) {
        return res
          .status(403)
          .json({ success: false, message: 'You are not authorized to perform this action.' });
      }

      req[resourceKey] = resource;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requireBrandOwnership;