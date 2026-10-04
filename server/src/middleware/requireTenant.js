const { ROLES } = require('../config/roles');

/**
 * Tenant (brand) context middleware, per
 * docs/02-user-roles-and-permissions.md §16 (Brand Isolation Rules) and
 * AGENTS.md §7 (Multi-Tenancy — "Tenant isolation MUST be enforced on
 * the backend. Frontend hiding is not security.").
 *
 * This is step 3 of the authorization chain:
 *   authenticate -> role/permission -> tenant/brand ownership ->
 *   resource ownership -> controller
 *
 * It answers "does this request even have a valid tenant context to act
 * in?" — NOT "does this specific resource belong to that tenant?" (that
 * is requireBrandOwnership.js, the next step in the chain).
 *
 * The tenant is always derived from the authenticated user
 * (req.user.brandId), never from client input (docs/02 §17 — "The
 * server must not trust brandId sent by the frontend"; AGENTS.md §9 —
 * "Never trust client-provided ownership fields"). This middleware
 * never reads req.body.brandId / req.query.brandId / req.params.brandId
 * for authorization purposes.
 *
 * On success, attaches `req.tenantBrandId`:
 *   - SUPER_ADMIN  -> null (platform-wide, not restricted to one brand)
 *   - BRAND_ADMIN / BRAND_EMPLOYEE -> req.user.brandId (string)
 *
 * Downstream code should treat `req.tenantBrandId === null` as "no
 * brand restriction applies" and otherwise scope every query to it.
 */
function requireTenant(req, res, next) {
  if (!req.user) {
    // Defensive: this middleware is only meant to run after
    // `authenticate`, but fail safe (401, not a crash) if it's ever
    // used without it — same pattern as requireRole.js/requirePermission.js.
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const deny = (code = 'ROLE_NOT_ALLOWED') =>
    res
      .status(403)
      .json({ success: false, message: 'You are not authorized to perform this action.', code });

  if (req.user.role === ROLES.SUPER_ADMIN) {
    req.tenantBrandId = null;
    return next();
  }

  if (req.user.role === ROLES.BRAND_ADMIN || req.user.role === ROLES.BRAND_EMPLOYEE) {
    // Defense-in-depth: the User schema already requires brandId for
    // these roles (see models/user.model.js), but a tenant-scoped route
    // should never proceed on a missing brandId regardless.
    if (!req.user.brandId) {
      return deny('NO_BRAND');
    }
    req.tenantBrandId = req.user.brandId.toString();
    return next();
  }

  // CUSTOMER (and any unrecognized role): not a brand-admin tenant user
  // (per this phase's spec) — customer ownership of their own orders
  // etc. is a separate, later-phase concern, not brand-tenant
  // authorization.
  return deny();
}

module.exports = requireTenant;