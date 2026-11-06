const mongoose = require('mongoose');

/**
 * ServiceConversation — the chat thread of ONE accepted booking (docs/24 §4.5).
 *
 * Access is booking membership, never a general provider inbox: the customer
 * of the booking, the provider owner, and a super admin with the relevant
 * permission. No other provider can read it.
 */
const SIDES = ['CUSTOMER', 'PROVIDER', 'SYSTEM'];

const serviceConversationSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceBooking',
      required: true,
      unique: true,
    },
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

serviceConversationSchema.index({ customerId: 1, lastMessageAt: -1 });
serviceConversationSchema.index({ providerId: 1, lastMessageAt: -1 });

const ServiceConversation = mongoose.model('ServiceConversation', serviceConversationSchema);
ServiceConversation.SIDES = SIDES;

module.exports = ServiceConversation;
