const bcrypt = require('bcrypt');

/**
 * Password hashing/comparison, per docs/06-authentication-and-security.md
 * §5 (Password Security) — "Passwords must be hashed using: bcrypt."
 */

// Standard, widely-used bcrypt cost factor. Not specified by the docs
// (which only name bcrypt itself), so this is an implementation default.
const SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };