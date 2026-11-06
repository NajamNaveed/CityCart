const mongoose = require('mongoose');

const { SELLER_TYPES, HELP_STATUSES } = require('../config/billing');

/**
 * A seller's billing question or dispute (docs/15 §10, docs/24 §5.6).
 *
 * Kept separate from support chat: only the seller tenant and the super admin
 * can read it, and the seller id always comes from the session.
 */
const billingHelpSchema = new mongoose.Schema(
  {
    sellerType: { type: String, enum: SELLER_TYPES, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: HELP_STATUSES, default: 'OPEN', index: true },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

billingHelpSchema.index({ sellerType: 1, sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('BillingHelpRequest', billingHelpSchema);
