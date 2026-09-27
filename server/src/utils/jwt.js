const jwt = require('jsonwebtoken');

const env = require('../config/env');

/**
 * JWT creation/verification, per
 * docs/06-authentication-and-security.md §7 (JWT Authentication).
 *
 * The payload intentionally carries only userId/role/brandId — "only the
 * information required for authentication and authorization." Never put
 * passwords, password hashes, or other sensitive data in the token.
 */

function signToken({ userId, role, brandId }) {
  if (!env.jwtSecret) {
    throw new Error(
      'JWT_SECRET is not set. Add it to server/.env (see .env.example).'
    );
  }

  return jwt.sign({ userId, role, brandId: brandId || null }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyToken(token) {
  if (!env.jwtSecret) {
    throw new Error(
      'JWT_SECRET is not set. Add it to server/.env (see .env.example).'
    );
  }

  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signToken, verifyToken };