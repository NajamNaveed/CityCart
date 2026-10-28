const mongoose = require('mongoose');

/**
 * AdminAction — the platform admin audit log (docs/21-next-features-plan.md
 * §G.2). One row per admin write, by anyone (super admin or partner), so two
 * people acting on the platform stay accountable. Visible to the super admin
 * only.
 *
 * `action` follows the same resource.action convention as permissions
 * (e.g. 'brand.terminate', 'settings.update'). `target` is what was acted
 * on; `details` holds a short human-readable summary, never secrets.
 */
const adminActionSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Stored with the row so the log stays truthful if a role changes later.
    actorRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    target: {
      type: { type: String, trim: true },
      id: { type: mongoose.Schema.Types.ObjectId },
      label: { type: String, trim: true },
    },
    details: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

adminActionSchema.index({ createdAt: -1 });

const AdminAction = mongoose.model('AdminAction', adminActionSchema);

module.exports = AdminAction;
