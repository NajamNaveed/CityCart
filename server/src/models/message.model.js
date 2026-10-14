const mongoose = require('mongoose');

const { SIDES } = require('./conversation.model');

/**
 * Message — one chat message. Plain text only (never rendered as HTML), and
 * immutable: there is no edit or delete, so a conversation is an honest record
 * if a dispute ever needs one. `productId` optionally pins the message to a
 * product of the brand ("I'm asking about this one").
 */
const MAX_BODY_LENGTH = 1000;

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: SIDES, required: true },
    body: { type: String, required: true, trim: true, maxlength: MAX_BODY_LENGTH },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Newest-first paging inside one conversation uses _id as the cursor.
messageSchema.index({ conversationId: 1, _id: -1 });

const Message = mongoose.model('Message', messageSchema);
Message.MAX_BODY_LENGTH = MAX_BODY_LENGTH;

module.exports = Message;
