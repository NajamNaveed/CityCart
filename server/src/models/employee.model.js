const mongoose = require('mongoose');

/**
 * Employee model — brand-employee-specific information referencing a User.
 *
 * Source of truth: docs/04-database-design.md, §5 (Collections) and §12
 * (Employee Model).
 *
 * NOTE — unresolved documentation conflict (flagged, not silently
 * resolved): §12 states the *recommended* approach is to represent
 * employee data on the User model itself (User + brandId + role +
 * permissions), and that a dedicated `employees` collection should only
 * be introduced "if it becomes necessary later." However, §5 lists
 * `employees` as one of the initial MVP collections. This task's
 * instructions also disallow modifying user.model.js. Given that
 * constraint, this dedicated collection (using the "potential fields"
 * §12 lists) is the only way to satisfy §5 without touching User. See
 * the Phase 2 report for this decision — it should be confirmed by a
 * human before Phase 3 (Employees & Permissions) builds on it.
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
      index: true,
    },
    // §10 (Brand Ownership) explicitly lists Employee.brandId as an
    // ownership/tenant-isolation example.
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: true,
      index: true,
    },
    permissions: {
      type: [String],
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
  },
  {
    timestamps: true,
  }
);

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;