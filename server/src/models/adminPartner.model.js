const mongoose = require('mongoose');

const { ALL_ADMIN_PERMISSIONS } = require('../config/adminPermissions');

/**
 * AdminPartner — the delegated platform-admin record of an ADMIN_PARTNER user
 * (docs/21-next-features-plan.md §G.2). Mirrors the Employee model: the login
 * lives on User, the platform-admin-specific data lives here.
 *
 * `permissions` is validated against the closed list in
 * config/adminPermissions.js (unlike Employee.permissions, which is open
 * extensibility, the admin areas are a fixed, documented set).
 */
const adminPartnerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // a user has at most one partner record
    },
    permissions: {
      type: [{
        type: String,
        enum: ALL_ADMIN_PERMISSIONS,
      }],
      default: [],
    },
    // True = may open the ticked areas but never change anything ("Read only"
    // preset). Enforced on the server for every non-GET admin route.
    readOnly: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

const AdminPartner = mongoose.model('AdminPartner', adminPartnerSchema);

module.exports = AdminPartner;
