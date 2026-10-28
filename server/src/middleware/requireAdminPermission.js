const AdminPartner = require('../models/adminPartner.model');
const { ROLES } = require('../config/roles');

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Platform-admin authorization, per docs/21-next-features-plan.md §G.2.
 *
 *   super admin            -> allowed everywhere
 *   admin partner          -> allowed where AdminPartner.permissions holds the
 *                             area; writes additionally refused when the
 *                             partner is read-only
 *   roles in allowRoles    -> allowed (they are guarded elsewhere on that route)
 *   anyone else            -> 403
 *
 * It must run after `authenticate`. The partner record is loaded fresh on each
 * request (not from the JWT), like requirePermission does for employees, so
 * deactivating a partner or removing a permission takes effect immediately.
 *
 * Usage: router.use(authenticate, requireAdminPermission(ADMIN_PERMISSIONS.ORDERS))
 */
function requireAdminPermission(permission, { allowRoles = [] } = {}) {
  return async function adminPermissionMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
      }

      const deny = (code, extra = {}) =>
        res
          .status(403)
          .json({ success: false, message: 'You are not authorized to perform this action.', code, ...extra });

      if (allowRoles.includes(req.user.role)) {
        return next();
      }
      if (req.user.role === ROLES.SUPER_ADMIN) {
        return next();
      }
      if (req.user.role !== ROLES.ADMIN_PARTNER) {
        return deny('ROLE_NOT_ALLOWED');
      }

      const partner = await AdminPartner.findOne({ userId: req.user._id });
      if (!partner || !partner.isActive) {
        return deny('ADMIN_PARTNER_INACTIVE');
      }
      if (!READ_METHODS.has(req.method) && partner.readOnly) {
        return deny('READ_ONLY');
      }
      if (!partner.permissions.includes(permission)) {
        return deny('PERMISSION_DENIED', { permission });
      }

      // Exposed so handlers (and requirePermission on shared routes) know a
      // platform-admin partner already passed this route's area check.
      req.adminPartner = partner;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requireAdminPermission;
