const mongoose = require('mongoose');

/**
 * One document per AI request, successful or not (docs/27 §3.1). It backs the
 * per-user daily counter (docs/27 §3.2), the fallback/failure review in
 * docs/29 Phase 7b, and the admin usage view.
 *
 * Deliberately stores no prompt, response or personal text: only who/what and
 * how much. `userId` is null for scheduled automations that run without a user.
 */
const aiUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    role: {
      type: String,
      default: null,
    },
    // Task name from the request, e.g. 'listing-draft' or 'shop-assistant'.
    agent: {
      type: String,
      default: null,
    },
    // The provider that answered; null when every provider failed.
    provider: {
      type: String,
      default: null,
    },
    model: {
      type: String,
      default: null,
    },
    promptTokens: {
      type: Number,
      default: 0,
    },
    completionTokens: {
      type: Number,
      default: 0,
    },
    // Providers tried before the request settled.
    attempts: {
      type: Number,
      default: 0,
    },
    ms: {
      type: Number,
      default: 0,
    },
    ok: {
      type: Boolean,
      default: false,
    },
    // Failure summary, capped at 300 characters; never a provider key.
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

aiUsageSchema.index({ userId: 1, createdAt: -1 });
aiUsageSchema.index({ agent: 1, createdAt: -1 });
aiUsageSchema.index({ ok: 1, createdAt: -1 });

const AiUsage = mongoose.model('AiUsage', aiUsageSchema);

module.exports = AiUsage;
