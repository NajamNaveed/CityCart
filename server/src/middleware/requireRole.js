/**
 * Role authorization middleware, per
 * docs/02-user-roles-and-permissions.md §25 (API Authorization Pattern)
 * and §26 (Error Handling).
 *
 * This must run after the `authenticate` middleware (req.user must
 * already be set). It only answers "does this role have access at
 * all?" — permission-level checks live in requirePermission.js, and
 * brand/resource ownership checks are explicitly out of this phase's
 * scope (they'll be a separate middleware in a later phase, per §12 —
 * Authorization Rules: Authentication -> Role -> Permission ->
 * Resource Ownership).
 *
 * Usage: router.get('/admin-only', authenticate, requireRole(ROLES.SUPER_ADMIN), handler)
 */
function requireRole(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      // Defensive: this middleware is only meant to run after
      // `authenticate`, but fail safe (401, not a crash) if it's ever
      // used without it.
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Wording matches docs/06-authentication-and-security.md §29's
      // error example, kept consistent across all authorization
      // failures in this codebase.
      return res
        .status(403)
        .json({
          success: false,
          message: 'You are not authorized to perform this action.',
          code: 'ROLE_NOT_ALLOWED',
        });
    }

    return next();
  };
}

module.exports = requireRole;