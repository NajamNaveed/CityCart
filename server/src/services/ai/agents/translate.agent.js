const mongoose = require('mongoose');
const { z } = require('zod');

const Message = require('../../../models/message.model');
const Conversation = require('../../../models/conversation.model');
const { SIDE } = require('../../chat.service');
const { generate } = require('../index');
const { getCached, setCached } = require('../cache');
const { sanitizeUserText, parseModelJson } = require('../guard');
const { buildTranslateMessages } = require('../prompts/translate.prompt');

const TARGET_LANGS = ['en', 'ur', 'roman-ur'];
// Messages are immutable, so one translation can be reused for a week.
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

class TranslateError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const modelSchema = z.object({
  translation: z.string().trim().min(1).max(2000),
});

function cacheKeyOf(messageId, targetLang) {
  return `translate:${messageId}:${targetLang}`;
}

/**
 * The caller must be a participant of the message's own conversation. The
 * message id is the only thing the client sends; the body, the sender and the
 * conversation all come from the database.
 */
async function loadMessageFor(chat, messageId) {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    throw new TranslateError(404, 'Message not found.');
  }
  const message = await Message.findById(messageId).lean();
  if (!message) throw new TranslateError(404, 'Message not found.');

  const conversation = await Conversation.findById(message.conversationId, 'customerId brandId').lean();
  if (!conversation) throw new TranslateError(404, 'Message not found.');

  const participant =
    chat.side === SIDE.CUSTOMER
      ? String(conversation.customerId) === String(chat.customerId)
      : String(conversation.brandId) === String(chat.brandId);
  if (!participant) {
    throw new TranslateError(403, 'You are not authorized to perform this action.', 'NOT_A_PARTICIPANT');
  }
  return message;
}

async function translateMessage({ messageId, targetLang, chat }) {
  if (!TARGET_LANGS.includes(targetLang)) {
    throw new TranslateError(400, 'Unsupported target language.');
  }

  const message = await loadMessageFor(chat, messageId);

  const key = cacheKeyOf(message._id, targetLang);
  const cached = await getCached(key);
  if (cached) return cached;

  const text = sanitizeUserText(message.body, Message.MAX_BODY_LENGTH);
  if (!text) throw new TranslateError(400, 'This message has no text to translate.');

  const result = await generate({
    task: 'chat-translate',
    messages: buildTranslateMessages({ text, targetLang }),
    json: true,
    temperature: 0.2,
    maxTokens: 700,
    userId: chat.user._id,
    role: chat.user.role,
  });

  const parsed = parseModelJson(result.text, modelSchema);
  const value = { translation: parsed.translation, targetLang };
  await setCached(key, value, CACHE_TTL_SECONDS);
  return value;
}

module.exports = {
  translateMessage,
  TranslateError,
  TARGET_LANGS,
  CACHE_TTL_SECONDS,
  cacheKeyOf,
};
