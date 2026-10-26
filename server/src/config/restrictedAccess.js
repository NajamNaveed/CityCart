/**
 * Read-only mode for the staff of a terminated brand during their grace
 * period. Everything that only READS is allowed (so they can see orders,
 * deliveries and payments they still need to deal with). Of the writes, only
 * the ones listed here are allowed — finishing deliveries that are already
 * on the road, so customers aren't left stranded and COD cash is recorded.
 * Everything else (catalog, stock, employees, refunds, new status changes)
 * is blocked.
 */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const ALLOWED_WRITES = [
  { method: 'PATCH', pattern: /^\/api\/v1\/deliveries\/[a-f0-9]{24}\/status$/i },
  // The riders of a terminated brand can also finish what is already on the road.
  { method: 'PATCH', pattern: /^\/api\/v1\/rider\/deliveries\/[a-f0-9]{24}\/status$/i },
  { method: 'POST', pattern: /^\/api\/v1\/rider\/deliveries\/[a-f0-9]{24}\/complete$/i },
  // Finishing deliveries on the road includes the rider's position and their phone's push setup.
  { method: 'PUT', pattern: /^\/api\/v1\/rider\/deliveries\/location$/i },
  { method: 'DELETE', pattern: /^\/api\/v1\/rider\/deliveries\/location$/i },
  { method: 'DELETE', pattern: /^\/api\/v1\/devices\/push-token$/i },
  // Handing cash over is closing the books, not trading.
  { method: 'POST', pattern: /^\/api\/v1\/payments\/cash\/settle$/i },
];

function isAllowedWhenRestricted(method, path) {
  if (SAFE_METHODS.includes(method)) {
    return true;
  }
  return ALLOWED_WRITES.some((rule) => rule.method === method && rule.pattern.test(path));
}

module.exports = { isAllowedWhenRestricted };
