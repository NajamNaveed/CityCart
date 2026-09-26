const mongoose = require('mongoose');

/**
 * User model — represents authentication and identity.
 *
 * Source of truth: docs/04-database-design.md, §6 (User Model) and §7
 * (User Constraints).
 *
 * Phase 2 scope: schema definition only. Password hashing, JWT issuance,
 * registration/login, and RBAC middleware are later-phase concerns (see
 * docs/18-development-roadmap.md, Phase 2 — Authentication & Users) and
 * are not implemented here.
 */

const ROLES = ['SUPER_ADMIN', 'BRAND_ADMIN', 'BRAND_EMPLOYEE', 'CUSTOMER'];

// Brand-scoped roles must carry a brandId; SUPER_ADMIN and CUSTOMER must
// not, per §6: "A customer is not a tenant member merely because they
// purchase from a brand."
const BRAND_SCOPED_ROLES = ['BRAND_ADMIN', 'BRAND_EMPLOYEE'];

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
      enum: ROLES,
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