const mongoose = require('mongoose');

/**
 * Employee model — one membership of one brand.
 *
 * Source of truth: docs/04-database-design.md §12 (Employee Model) and
 * docs/24-marketplace-v3-plan.md §3.2 (Employee becomes a membership).
 *
 * A User may now hold one membership per brand (a BRAND_EMPLOYEE shared by
 * several brands), so `userId` is no longer globally unique. The partial
 * unique index below allows one ACTIVE membership per (userId, brandId) while
 * keeping inactive history rows for the audit trail.
 *
 * `permissions` intentionally has no fixed enum: the permission strings
 * themselves are defined in docs/02-user-roles-and-permissions.md, which
 * explicitly documents the permission system as extensible (§24 — Future
 * Permission Expansion). A closed Mongoose enum here would contradict
 * that.
 */
const employeeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // §10 (Brand Ownership) explicitly lists Employee.brandId as an
    // ownership/tenant-isolation example.
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
    },
    // The role held inside this brand. It mirrors User.role for employees;
    // the session carries the membership role so a switch cannot inherit a
    // role from another brand.
    role: {
      type: String,
      enum: ['BRAND_ADMIN', 'BRAND_EMPLOYEE', 'PICKER'],
      default: 'BRAND_EMPLOYEE',
    },
    permissions: {
      type: [String],
      default: [],
    },
    // Audit trail of permission changes (docs/02 §20: protected action).
    permissionHistory: {
      type: [
        new mongoose.Schema(
          {
            by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            at: { type: Date, default: Date.now },
            added: { type: [String], default: [] },
            removed: { type: [String], default: [] },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    jobTitle: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Removal from one brand (docs/24 §3.6): the membership is deactivated,
    // never deleted, so the history and the audit trail survive.
    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    removalReason: { type: String, trim: true, default: null },
  },
  {
    timestamps: true,
  }
);

// One active membership per person per brand. Inactive rows stay for history
// and may be reactivated (after the active duplicate rule is satisfied).
employeeSchema.index(
  { userId: 1, brandId: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: 'active_membership_unique' }
);
employeeSchema.index({ brandId: 1, isActive: 1 });
employeeSchema.index({ userId: 1, isActive: 1 });

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;
