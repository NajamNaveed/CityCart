const mongoose = require('mongoose');

/**
 * ProviderConversation — a direct customer ↔ provider thread that is not tied
 * to one booking (docs/24 §4.5). It lets a customer ask a provider about the
 * work before booking, and keeps that conversation after a booking exists.
 *
 * Membership is the pair (customerId, providerId); the compound unique index
 * guarantees one thread per pair without colliding on nulls the way an
 * optional unique bookingId would.
 */
const SIDES = ['CUSTOMER', 'PROVIDER', 'SYSTEM'];

const providerConversationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProvider', required: true },
    lastMessageAt: { type: Date, required: true },
    lastMessagePreview: { type: String, default: '', maxlength: 120 },
    lastSenderRole: { type: String, enum: SIDES, required: true },
    customerUnread: { type: Number, default: 0, min: 0 },
    providerUnread: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

providerConversationSchema.index({ customerId: 1, providerId: 1 }, { unique: true });
providerConversationSchema.index({ customerId: 1, lastMessageAt: -1 });
providerConversationSchema.index({ providerId: 1, lastMessageAt: -1 });

const ProviderConversation = mongoose.model('ProviderConversation', providerConversationSchema);
ProviderConversation.SIDES = SIDES;

module.exports = ProviderConversation;
