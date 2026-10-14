const mongoose = require('mongoose');

/**
 * Conversation — one chat thread between ONE customer and ONE brand (not a
 * single staff member: any team member with the right permission can answer
 * for the brand). Created lazily with the first message, so every
 * conversation has at least one message and the brand's inbox never shows
 * empty threads.
 *
 * Unread counters are kept per side and updated atomically with each message,
 * so the inbox badge is a cheap sum instead of a scan over messages.
 */
const SIDES = ['CUSTOMER', 'BRAND'];

const conversationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    lastMessageAt: { type: Date, required: true },
    lastMessagePreview: { type: String, default: '', maxlength: 120 },
    lastSenderRole: { type: String, enum: SIDES, required: true },
    customerUnread: { type: Number, default: 0, min: 0 },
    brandUnread: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// A customer has at most one thread per brand.
conversationSchema.index({ customerId: 1, brandId: 1 }, { unique: true });
conversationSchema.index({ brandId: 1, lastMessageAt: -1 });
conversationSchema.index({ customerId: 1, lastMessageAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
Conversation.SIDES = SIDES;

module.exports = Conversation;
