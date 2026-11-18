const mongoose = require('mongoose');
const { z } = require('zod');

const ProviderConversation = require('../../../models/providerConversation.model');
const ProviderMessage = require('../../../models/providerMessage.model');
const ServiceConversation = require('../../../models/serviceConversation.model');
const ServiceMessage = require('../../../models/serviceMessage.model');
const ServiceBooking = require('../../../models/serviceBooking.model');
const ServiceProvider = require('../../../models/serviceProvider.model');
const { CHAT_OPEN_STATUSES } = require('../../../config/serviceBookingStatuses');
const { generate } = require('../index');
const { sanitizeUserText, parseModelJson } = require('../guard');
const {
  buildChatDraftMessages,
  DRAFT_LIMIT,
  INTENT_LIMIT,
  HISTORY_MESSAGES,
} = require('../prompts/chatDraft.prompt');

/**
 * Customer chat drafting (docs/29 Phase 2f). The customer types a short intent
 * for a provider or booking thread; the model writes a message that fills the
 * composer. Nothing is sent: the customer edits and posts it through the
 * ordinary chat endpoint, which re-checks membership and the booking status.
 *
 * The thread is loaded server-side from the kind and its id, so a caller can
 * never pass someone else's messages in the body. A thread that is not the
 * caller's own answers 404, the same anti-probing answer the chat services use.
 */
const KINDS = ['provider', 'booking'];
const MESSAGE_TEXT_LIMIT = 500;

class ChatDraftError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const modelSchema = z.object({
  draft: z.string().trim().min(1).max(DRAFT_LIMIT),
});

function historyForPrompt(rows) {
  return rows
    .slice()
    .reverse()
    .filter((message) => message.senderRole === 'CUSTOMER' || message.senderRole === 'PROVIDER')
    .map((message) => {
      const body = sanitizeUserText(message.body || '', MESSAGE_TEXT_LIMIT).replace(/\s+/g, ' ');
      const text = body || (message.attachments && message.attachments.length ? '[sent a photo]' : '');
      return {
        from: message.senderRole === 'CUSTOMER' ? 'Customer' : 'Provider',
        text,
      };
    })
    .filter((message) => message.text);
}

function providerName(provider) {
  return provider ? provider.displayName : 'Service provider';
}

async function loadProviderThread(customerId, conversationId) {
  const conversation = await ProviderConversation.findById(conversationId).lean();
  if (!conversation || String(conversation.customerId) !== String(customerId)) {
    throw new ChatDraftError(404, 'Conversation not found.');
  }

  const [provider, history] = await Promise.all([
    ServiceProvider.findById(conversation.providerId).select('displayName').lean(),
    ProviderMessage.find({ conversationId: conversation._id })
      .sort({ _id: -1 })
      .limit(HISTORY_MESSAGES)
      .lean(),
  ]);

  return { counterpart: providerName(provider), subject: null, history };
}

async function loadBookingThread(customerId, bookingId) {
  const booking = await ServiceBooking.findById(bookingId).lean();
  if (!booking || String(booking.customerId) !== String(customerId)) {
    throw new ChatDraftError(404, 'Booking not found.');
  }
  if (!CHAT_OPEN_STATUSES.includes(booking.status)) {
    throw new ChatDraftError(409, 'Chat opens once the provider accepts this booking.', 'CHAT_NOT_OPEN');
  }

  const [provider, conversation] = await Promise.all([
    ServiceProvider.findById(booking.providerId).select('displayName').lean(),
    ServiceConversation.findOne({ bookingId: booking._id }).select('_id').lean(),
  ]);
  const history = conversation
    ? await ServiceMessage.find({ conversationId: conversation._id })
        .sort({ _id: -1 })
        .limit(HISTORY_MESSAGES)
        .lean()
    : [];

  return {
    counterpart: providerName(provider),
    subject: booking.offering ? booking.offering.title : null,
    history,
  };
}

async function draftChatMessage({ kind, id, intent, ctx }) {
  if (!KINDS.includes(kind)) {
    throw new ChatDraftError(400, 'Choose a conversation type.');
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ChatDraftError(404, kind === 'provider' ? 'Conversation not found.' : 'Booking not found.');
  }

  const cleanIntent = sanitizeUserText(intent, INTENT_LIMIT);
  if (!cleanIntent) {
    throw new ChatDraftError(400, 'Say what you want to ask.');
  }

  const thread =
    kind === 'provider'
      ? await loadProviderThread(ctx.userId, id)
      : await loadBookingThread(ctx.userId, id);

  const result = await generate({
    task: 'chat-draft',
    messages: buildChatDraftMessages({
      counterpart: thread.counterpart,
      subject: thread.subject,
      history: historyForPrompt(thread.history),
      intent: cleanIntent,
    }),
    json: true,
    temperature: 0.4,
    maxTokens: 500,
    userId: ctx.userId,
    role: ctx.role,
  });

  const parsed = parseModelJson(result.text, modelSchema);
  return { draft: parsed.draft };
}

module.exports = {
  draftChatMessage,
  ChatDraftError,
  KINDS,
  DRAFT_LIMIT,
  INTENT_LIMIT,
  HISTORY_MESSAGES,
};
