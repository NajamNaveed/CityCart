const mongoose = require('mongoose');

const AUTH_TOKEN_TYPES = ['EMAIL_VERIFY', 'PASSWORD_RESET'];

/**
 * One-time tokens for email verification and password reset.
 *
 * Only the SHA-256 hash of the token is stored: a leaked database copy cannot
 * be turned back into a working link. `expiresAt` has a TTL index, so MongoDB
 * deletes spent/expired tokens on its own — important on a Render free
 * instance, where there is no reliable cron to run a cleanup job.
 */
const authTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: AUTH_TOKEN_TYPES,
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

authTokenSchema.index({ userId: 1, type: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthToken = mongoose.model('AuthToken', authTokenSchema);

module.exports = AuthToken;
module.exports.AUTH_TOKEN_TYPES = AUTH_TOKEN_TYPES;
