const Employee = require('../models/employee.model');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
const { SIDE } = require('../services/chat.service');

/**
 * Decides WHO is chatting and on which side, once, for every chat route.
 * Sets req.chat = { side, user, customerId | brandId, canReply }.
 *
 *  - CUSTOMER      -> customer side, scoped to their own conversations.
 *  - BRAND_ADMIN   -> brand side for their own brand, may reply.
 *  - BRAND_EMPLOYEE-> brand side for their own brand; needs messages.view to
 *                     read and messages.manage to reply (checked fresh from
 *                     the database on every request, like requirePermission).
 *  - anyone else (super admin included) is refused: platform staff do not
 *    read private customer conversations through this API.
 * The brand always comes from the signed-in user, never from the request.
 */
async function chatAccess(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const deny = (code = 'ROLE_NOT_ALLOWED') =>
      res.status(403).json({ success: false, message: 'You are not authorized to perform this action.', code });

    switch (req.user.role) {
      case ROLES.CUSTOMER:
        req.chat = { side: SIDE.CUSTOMER, user: req.user, customerId: req.user._id, canReply: true };
        return next();

      case ROLES.BRAND_ADMIN:
        if (!req.user.brandId) return deny('NO_BRAND');
        req.chat = { side: SIDE.BRAND, user: req.user, brandId: req.user.brandId, canReply: true };
        return next();

      case ROLES.BRAND_EMPLOYEE: {
        if (!req.user.brandId) return deny('NO_BRAND');
        const employee = await Employee.findOne({ userId: req.user._id });
        if (!employee || !employee.isActive) return deny('EMPLOYEE_INACTIVE');
        const canReply = employee.permissions.includes(PERMISSIONS.MESSAGES_MANAGE);
        const canRead = canReply || employee.permissions.includes(PERMISSIONS.MESSAGES_VIEW);
        if (!canRead) return deny('PERMISSION_DENIED');
        req.chat = { side: SIDE.BRAND, user: req.user, brandId: req.user.brandId, canReply };
        return next();
      }

      default:
        return deny();
    }
  } catch (err) {
    return next(err);
  }
}

// Route guards that run after chatAccess.
const customerOnly = (req, res, next) =>
  req.chat.side === SIDE.CUSTOMER
    ? next()
    : res.status(403).json({ success: false, message: 'You are not authorized to perform this action.', code: 'ROLE_NOT_ALLOWED' });

const mustBeAbleToReply = (req, res, next) =>
  req.chat.canReply
    ? next()
    : res
        .status(403)
        .json({ success: false, message: 'You are not authorized to perform this action.', code: 'PERMISSION_DENIED', permission: PERMISSIONS.MESSAGES_MANAGE });

module.exports = { chatAccess, customerOnly, mustBeAbleToReply };
