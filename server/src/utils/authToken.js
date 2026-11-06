const crypto = require('crypto');

/**
 * Email-link tokens: 32 random bytes, URL-safe in hex. The raw value only
 * ever exists in the email; the database keeps its SHA-256 hash.
 */
function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashAuthToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { createAuthToken, hashAuthToken };
