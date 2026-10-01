const { ROLES } = require('../config/roles');

const BRAND_ROLES = [ROLES.BRAND_ADMIN, ROLES.BRAND_EMPLOYEE];

/**
 * Wraps a brand-only middleware (requirePermission / requireTenant) so it
 * applies to brand users but lets customers and super admins straight
 * through. Used on endpoints shared by several roles (e.g. GET a delivery,
 * GET an order's payment) where each role is scoped differently.
 */
const forBrandUsers = (middleware) => (req, res, next) =>
  BRAND_ROLES.includes(req.user.role) ? middleware(req, res, next) : next();

module.exports = { forBrandUsers, BRAND_ROLES };
