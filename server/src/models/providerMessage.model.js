const mongoose = require('mongoose');

const { SIDES } = require('./providerConversation.model');

/**
 * ProviderMessage — one immutable message in a direct customer ↔ provider
 * thread (docs/24 §4.5). Text only; it is always rendered as a text node.
 */
const MAX_BODY_LENGTH = 1000;

const providerMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProviderConversation',
      required: true,
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: SIDES, required: true },
    body: { type: String, trim: true, required: true, maxlength: MAX_BODY_LENGTH },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

providerMessageSchema.index({ conversationId: 1, _id: -1 });

const ProviderMessage = mongoose.model('ProviderMessage', providerMessageSchema);
ProviderMessage.MAX_BODY_LENGTH = MAX_BODY_LENGTH;

module.exports = ProviderMessage;
