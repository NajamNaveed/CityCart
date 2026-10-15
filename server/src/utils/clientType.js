/**
 * Native-app support for the auth endpoints (docs/19-mobile-app.md).
 *
 * Browsers keep the session in an HTTP-only cookie that JavaScript can never
 * read. A native app has no such cookie jar it can rely on, so it asks for the
 * token explicitly with `X-Client: mobile` and sends it back as
 * `Authorization: Bearer <token>`. The web app never sends that header, so it
 * never receives a token in a response body.
 */
const isMobileClient = (req) => String(req.get('x-client') || '').trim().toLowerCase() === 'mobile';

/**
 * Reads `Authorization: Bearer <token>`.
 *   { present: false }                 no Bearer header (another scheme such as
 *                                      Basic, added by some hosting or proxies,
 *                                      is not ours and is ignored)
 *   { present: true, token: null }     "Bearer" with nothing usable after it
 *   { present: true, token: '...' }    a Bearer token
 */
function readBearerToken(req) {
  const header = req.get('authorization');
  if (header === undefined) return { present: false, token: null };
  const value = String(header).trim();
  if (!/^Bearer(\s|$)/i.test(value)) return { present: false, token: null };
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  return { present: true, token: match ? match[1] : null };
}

module.exports = { isMobileClient, readBearerToken };
