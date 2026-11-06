const { ROLES } = require('../config/roles');

/**
 * Seller billing tenant context (docs/15 §2, docs/24 §5.1).
 *
 * A seller account is per tenant: one brand is one billing account and one
 * service provider is another. The tenant is always derived from the session
 * (`req.user.brandId` or the ServiceProvider row resolved by `authenticate`),
 * never from a client-supplied id, so one seller can never read or pay another
 * seller's bill.
 *
 * On success attaches `req.seller = { type, id }`.
 */
function requireSellerTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  if (req.user.role === ROLES.BRAND_ADMIN && req.user.brandId) {
    req.seller = { type: 'BRAND', id: String(req.user.brandId) };
    return next();
  }

  if (req.user.role === ROLES.SERVICE_PROVIDER && req.provider) {
    req.seller = { type: 'SERVICE_PROVIDER', id: req.provider._id };
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Only the seller owner can manage billing.',
    code: 'ROLE_NOT_ALLOWED',
  });
}

module.exports = requireSellerTenant;
