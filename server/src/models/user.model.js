const mongoose = require('mongoose');

const { ALL_ROLES, BRAND_SCOPED_ROLES } = require('../config/roles');

/**
 * User model — represents authentication and identity.
 *
 * Source of truth: docs/04-database-design.md, §6 (User Model) and §7
 * (User Constraints).
 *
 * Phase 2 scope: schema definition only. Password hashing, JWT issuance,
 * and registration/login were added in the authentication phase.
 * RBAC role/permission constants now live in ../config/roles.js and
 * ../config/permissions.js (this file previously defined its own
 * ROLES/BRAND_SCOPED_ROLES arrays locally — moved out during the RBAC
 * phase so role names have a single source of truth instead of two
 * copies that could drift).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: EMAIL_REGEX,
    },
    // Stores only the password hash, never a plaintext password (§7).
    // select: false keeps it out of normal query results by default, so
    // it isn't accidentally returned through user API responses.
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: function isBrandIdRequired() {
        return BRAND_SCOPED_ROLES.includes(this.role);
      },
      validate: {
        validator: function isBrandIdAllowed(value) {
          // Reject a brandId on roles that must not be tenant-scoped.
          if (!BRAND_SCOPED_ROLES.includes(this.role)) {
            return value === undefined || value === null;
          }
          return true;
        },
        message: 'brandId is only allowed for BRAND_ADMIN and BRAND_EMPLOYEE roles.',
      },
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      trim: true,
    },
    // Soft-deactivation flag per docs/04-database-design.md §36 (Soft
    // Deletion) — Users deactivate via isActive rather than being deleted.
    isActive: {
      type: Boolean,
      default: true,
    },
    // Time-limited access after a brand is terminated: until accessExpiresAt
    // the account works in read-only mode (accessRestricted); afterwards
    // every request is rejected (see middleware/authenticate.js).
    accessExpiresAt: { type: Date },
    accessRestricted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    // Defense-in-depth for §7 ("Sensitive authentication information must
    // never be returned through normal user API responses"). select:
    // false above only affects query projection; this also strips
    // passwordHash from res.json()/JSON.stringify() output even when a
    // document was fetched with '+passwordHash' or constructed in memory.
    toJSON: {
      transform: function stripSensitiveFields(doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

const User = mongoose.model('User', userSchema);

module.exports = User;