const { ROLES } = require('../config/roles');

/**
 * Service-provider tenant context (docs/24 §3.4, docs/02 §16).
 *
 * The provider is resolved by `authenticate` from the session's account —
 * never from `req.body`, `req.query` or `req.params`. Downstream handlers
 * scope every query to `req.tenantProviderId`, exactly as brand handlers
 * scope to `req.tenantBrandId`.
 *
 * A provider session has no brand tenant, and a brand session has no
 * provider tenant: neither can reach the other's endpoints.
 */
function requireServiceTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (req.user.role !== ROLES.SERVICE_PROVIDER || !req.provider) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to perform this action.',
      code: 'ROLE_NOT_ALLOWED',
    });
  }
  req.tenantProviderId = req.provider._id;
  req.tenantType = 'SERVICE';
  return next();
}

module.exports = requireServiceTenant;
