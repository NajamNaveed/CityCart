const { isAllowedOrigin } = require('../config/cors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence for the cookie session (docs/06 §9, docs/24 §8.2).
 *
 * Production puts the web client on Vercel and the API on Render, so the auth
 * cookie is necessarily SameSite=None — browsers then attach it to cross-site
 * requests too. CORS stops a hostile page from READING our responses but does
 * not stop it from sending a form POST that changes state.
 *
 * Every browser sends `Origin` on an unsafe cross-site request, so an unsafe
 * request from an origin the CORS allow-list does not know is refused. A
 * request with no `Origin` (native apps, curl, server-to-server) is left
 * alone: it cannot be a forged browser request.
 */
function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (!isAllowedOrigin(origin)) {
      return res.status(403).json({
        success: false,
        message: 'Cross-site request blocked.',
        code: 'CSRF_ORIGIN',
      });
    }
    return next();
  }

  // Older browsers send only Referer. An unparseable one is refused.
  const referer = req.headers.referer;
  if (referer !== undefined) {
    const refererOrigin = originOf(referer);
    if (!refererOrigin || !isAllowedOrigin(refererOrigin)) {
      return res.status(403).json({
        success: false,
        message: 'Cross-site request blocked.',
        code: 'CSRF_ORIGIN',
      });
    }
  }

  return next();
}

module.exports = csrfGuard;
