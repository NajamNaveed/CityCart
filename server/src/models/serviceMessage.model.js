const mongoose = require('mongoose');

const { SIDES } = require('./serviceConversation.model');

/**
 * ServiceMessage — one immutable message in a booking chat (docs/24 §4.5).
 * Text and image references only; nothing is ever rendered as HTML.
 */
const MAX_BODY_LENGTH = 1000;
const MAX_ATTACHMENTS = 3;

const serviceMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceConversation',
      required: true,
      index: true,
    },
    // SYSTEM messages have no sender account.
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderRole: { type: String, enum: SIDES, required: true },
    body: { type: String, trim: true, maxlength: MAX_BODY_LENGTH },
    attachments: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

serviceMessageSchema.index({ conversationId: 1, _id: -1 });

const ServiceMessage = mongoose.model('ServiceMessage', serviceMessageSchema);
ServiceMessage.MAX_BODY_LENGTH = MAX_BODY_LENGTH;
ServiceMessage.MAX_ATTACHMENTS = MAX_ATTACHMENTS;

module.exports = ServiceMessage;
