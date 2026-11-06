const { randomBytes } = require('crypto');

const User = require('../models/user.model');
const { hashPassword } = require('../utils/password');

/**
 * Replaces a User's personal data with placeholders (docs/24 §3.6, docs/04
 * §36) so the original email can be registered again while historical
 * records that reference the _id still resolve.
 *
 * The bcrypt hash is computed before the caller opens its transaction: bcrypt
 * is deliberately slow and must not extend a database transaction.
 */
async function anonymizeUser({ userId, role, session }) {
  const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
  return User.findOneAndUpdate(
    { _id: userId, ...(role && { role }) },
    {
      $set: {
        name: 'Deleted user',
        email: `deleted+${String(userId)}@deleted.invalid`,
        passwordHash,
        isActive: false,
        deletedAt: new Date(),
        mustChangePassword: false,
        emailVerifiedAt: null,
        accessRestricted: false,
        accessExpiresAt: null,
      },
      $unset: { phone: 1, avatar: 1 },
      $inc: { passwordVersion: 1 },
    },
    { new: true, ...(session && { session }) }
  );
}

module.exports = { anonymizeUser };
