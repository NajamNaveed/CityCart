const Employee = require('../models/employee.model');
const { ROLES } = require('../config/roles');

/**
 * Permission authorization middleware, per
 * docs/02-user-roles-and-permissions.md:
 *   §7  Super Admin  — "not restricted to a single brand" (Full access)
 *   §8  Brand Admin  — "can manage the operational resources belonging
 *                       to that brand" (Full, per §11's Permission Matrix
 *                       — unlike employees, admins aren't granted
 *                       permissions individually)
 *   §9  Brand Employee — "Unlike Brand Admins, employees receive
 *                       explicit permissions. The employee can only
 *                       perform actions included in their permission
 *                       list."
 *   §10 Customer     — "Customers do not have administrative
 *                       permissions."
 *   §11 Permission Matrix (the source for the role-by-role behavior
 *                       below)
 *
 * This checks role/permission only. It deliberately does NOT check
 * brand/resource ownership (docs/02 §12 — Authorization Rules puts
 * "Resource Ownership / Tenant Scope" as a separate step after
 * Permission, and §9's "Important Rule" — "Permission + Brand Scope
 * must both pass authorization" — confirms passing this middleware is
 * necessary but not sufficient). A route needing ownership checks must
 * add that middleware separately in a later phase.
 *
 * Employee permissions are read from the existing Employee model
 * (Employee.permissions) — the single, already-established storage
 * location from Phase 2. This deliberately does not read from a JWT
 * claim: permissions can change after a token is issued (e.g. a future
 * employees.manage_permissions action), and the JWT's lifetime (see
 * config/env.js, JWT_EXPIRES_IN) is long enough that a claim would go
 * stale. Loading fresh here mirrors how `authenticate` already re-loads
 * the User on every request rather than trusting the JWT payload alone.
 *
 * Usage: router.patch('/products/:id', authenticate, requirePermission(PERMISSIONS.PRODUCTS_UPDATE), handler)
 */
function requirePermission(...permissions) {
  return async function permissionMiddleware(req, res, next) {
    try {
      if (!req.user) {
        // Defensive: see the same note in requireRole.js.
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      // `code` tells the client WHY (the message stays generic): a team member
      // missing a permission is a normal, explainable situation, not an error.
      const deny = (code = 'ROLE_NOT_ALLOWED', extra = {}) =>
        res
          .status(403)
          .json({ success: false, message: 'You are not authorized to perform this action.', code, ...extra });

      switch (req.user.role) {
        case ROLES.SUPER_ADMIN:
          // Platform-wide, unrestricted (§7).
          return next();

        case ROLES.BRAND_ADMIN:
          // Full access to their brand's operational resources without
          // needing individual permission entries (§8, §11). Brand
          // scoping itself is enforced by a separate, later-phase
          // ownership middleware — not here.
          return next();

        case ROLES.BRAND_EMPLOYEE: {
          const employee = await Employee.findOne({ userId: req.user._id });
                    if (!employee || !employee.isActive) {
            return deny('EMPLOYEE_INACTIVE');
          }
          if (!permissions.some((permission) => employee.permissions.includes(permission))) {
            return deny('PERMISSION_DENIED', {
              permission: permissions.length === 1 ? permissions[0] : permissions,
            });
          }
          // Exposed so handlers (e.g. permission-escalation checks) don't
          // have to re-query it.
          req.employee = employee;
          return next();
        }

        case ROLES.CUSTOMER:
        default:
          // Customers (and any unrecognized role) never hold
          // administrative/employee permissions (§10).
          return deny();
      }
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requirePermission;