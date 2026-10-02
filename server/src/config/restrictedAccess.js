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

const ALLOWED_WRITES = [{ method: 'PATCH', pattern: /^\/api\/v1\/deliveries\/[a-f0-9]{24}\/status$/i }];

function isAllowedWhenRestricted(method, path) {
  if (SAFE_METHODS.includes(method)) {
    return true;
  }
  return ALLOWED_WRITES.some((rule) => rule.method === method && rule.pattern.test(path));
}

module.exports = { isAllowedWhenRestricted };
