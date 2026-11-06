const AuthToken = require('../models/authToken.model');
const { createAuthToken, hashAuthToken } = require('../utils/authToken');

/**
 * Issue and consume the one-time tokens behind verification and password
 * reset. Issuing a token silently invalidates the previous one of the same
 * type, so only the newest email link works.
 */
async function issueToken({ userId, type, ttlMs, session }) {
  const token = createAuthToken();
  const options = session ? { session } : undefined;

  await AuthToken.deleteMany({ userId, type, usedAt: null }, options);
  const [doc] = await AuthToken.create(
    [{ userId, type, tokenHash: hashAuthToken(token), expiresAt: new Date(Date.now() + ttlMs) }],
    options
  );
  return { token, doc };
}

/**
 * Atomically claims a token: it must exist, match the type, be unused and
 * unexpired. Two simultaneous clicks on the same link: only one wins.
 */
async function consumeToken({ token, type, session }) {
  if (typeof token !== 'string' || token.length < 32) return null;
  const options = session ? { session } : undefined;
  return AuthToken.findOneAndUpdate(
    {
      tokenHash: hashAuthToken(token),
      type,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true, ...(options || {}) }
  );
}

module.exports = { issueToken, consumeToken };
