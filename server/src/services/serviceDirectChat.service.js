const mongoose = require('mongoose');

const ProviderConversation = require('../models/providerConversation.model');
const ProviderMessage = require('../models/providerMessage.model');
const ServiceProvider = require('../models/serviceProvider.model');
const User = require('../models/user.model');
const { ROLES } = require('../config/roles');
const { cleanMessageBody } = require('../utils/chatText');
const { emitChat } = require('../sockets');

/**
 * Direct customer ↔ provider chat (docs/24 §4.5). A customer starts a thread
 * from the provider's public page; the provider answers from their dashboard.
 * It is not tied to a booking, so a question can be asked before booking and
 * the same thread keeps working afterwards.
 *
 * Access is pair membership only: the customer who started it and the provider
 * who owns it. Everyone else receives 404 so thread ids cannot be probed.
 */
class ProviderChatError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SIDE = { CUSTOMER: 'CUSTOMER', PROVIDER: 'PROVIDER' };
const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_MESSAGE_LIMIT = 30;
const PREVIEW_LENGTH = 100;

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

function sideFor(actor) {
  return actor && actor.role === ROLES.SERVICE_PROVIDER ? SIDE.PROVIDER : SIDE.CUSTOMER;
}

function serializeMessage(message, side) {
  return {
    _id: message._id,
    conversationId: message.conversationId,
    senderRole: message.senderRole,
    mine: message.senderRole === side,
    body: message.body || '',
    createdAt: message.createdAt,
  };
}

async function loadConversation(actor, conversationId) {
  const conversation = await ProviderConversation.findById(conversationId);
  if (!conversation) throw new ProviderChatError(404, 'Conversation not found.');
  if (actor.role === ROLES.SERVICE_PROVIDER) {
    if (!actor.providerId || String(conversation.providerId) !== String(actor.providerId)) {
      throw new ProviderChatError(404, 'Conversation not found.');
    }
  } else if (String(conversation.customerId) !== String(actor._id)) {
    throw new ProviderChatError(404, 'Conversation not found.');
  }
  return { conversation, side: sideFor(actor) };
}

/** Customer opens (or reopens) a thread with one approved provider. */
async function startConversation(customerId, providerId) {
  const provider = await ServiceProvider.findOne({
    _id: providerId,
    status: 'ACTIVE',
    verification: 'VERIFIED',
    // Same rule as the public page: a frozen provider cannot take new contact.
    billingStatus: { $ne: 'FROZEN' },
  }).select('_id displayName avatar slug');
  if (!provider) throw new ProviderChatError(404, 'Provider not found.');

  let conversation = await ProviderConversation.findOne({
    customerId,
    providerId: provider._id,
  });
  if (!conversation) {
    try {
      conversation = await ProviderConversation.create({
        customerId,
        providerId: provider._id,
        lastMessageAt: new Date(),
        lastSenderRole: SIDE.CUSTOMER,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      conversation = await ProviderConversation.findOne({ customerId, providerId: provider._id });
    }
  }
  return {
    conversationId: conversation._id,
    provider: { name: provider.displayName, image: provider.avatar, slug: provider.slug },
  };
}

async function listConversations(actor, { page = 1, limit = DEFAULT_LIST_LIMIT } = {}) {
  let filter;
  if (actor.role === ROLES.SERVICE_PROVIDER) {
    if (!actor.providerId) return { conversations: [], pagination: { page, limit, total: 0, pages: 0 } };
    filter = { providerId: actor.providerId };
  } else {
    filter = { customerId: actor._id };
  }

  const [rows, total] = await Promise.all([
    ProviderConversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ProviderConversation.countDocuments(filter),
  ]);

  const isProviderSide = actor.role === ROLES.SERVICE_PROVIDER;
  const providerIds = [...new Set(rows.map((c) => String(c.providerId)))];
  const customerIds = [...new Set(rows.map((c) => String(c.customerId)))];

  const [providers, customers] = await Promise.all([
    !isProviderSide && providerIds.length
      ? ServiceProvider.find({ _id: { $in: providerIds } }).select('displayName avatar slug')
      : [],
    isProviderSide && customerIds.length ? User.find({ _id: { $in: customerIds } }).select('name') : [],
  ]);
  const providerById = new Map(providers.map((p) => [String(p._id), p]));
  const customerById = new Map(customers.map((u) => [String(u._id), u]));

  return {
    conversations: rows.map((c) => {
      const provider = providerById.get(String(c.providerId));
      const customer = customerById.get(String(c.customerId));
      return {
        _id: c._id,
        providerId: c.providerId,
        with: isProviderSide
          ? { name: customer ? customer.name : 'Customer', image: null }
          : provider
            ? { name: provider.displayName, image: provider.avatar, slug: provider.slug }
            : { name: 'Service provider', image: null },
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        unread: isProviderSide ? c.providerUnread : c.customerUnread,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function listMessages(actor, conversationId, { before, limit = DEFAULT_MESSAGE_LIMIT } = {}) {
  const { conversation, side } = await loadConversation(actor, conversationId);
  const filter = { conversationId: conversation._id, ...(before && { _id: { $lt: before } }) };
  const found = await ProviderMessage.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = found.length > limit;
  const page = found.slice(0, limit).reverse();
  return { messages: page.map((m) => serializeMessage(m, side)), hasMore };
}

async function pushMessage(conversation, message) {
  try {
    const summary = {
      kind: 'PROVIDER',
      conversationId: String(conversation._id),
      lastMessageAt: message.createdAt,
      lastMessagePreview: conversation.lastMessagePreview,
    };
    emitChat(conversation.customerId, { ...summary, message: serializeMessage(message, SIDE.CUSTOMER) });
    const provider = await ServiceProvider.findById(conversation.providerId).select('userId');
    if (provider) {
      emitChat(provider.userId, { ...summary, message: serializeMessage(message, SIDE.PROVIDER) });
    }
  } catch {
    /* delivery is an enhancement; the next refresh shows the message */
  }
}

async function sendMessage(actor, conversationId, { body }) {
  const { conversation, side } = await loadConversation(actor, conversationId);
  const text = cleanMessageBody(body || '');
  if (!text) throw new ProviderChatError(400, 'Write a message.');

  const message = await ProviderMessage.create({
    conversationId: conversation._id,
    senderId: actor._id,
    senderRole: side,
    body: text,
  });

  const preview = text.replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH);
  const otherUnread = side === SIDE.CUSTOMER ? 'providerUnread' : 'customerUnread';
  await ProviderConversation.updateOne(
    { _id: conversation._id },
    {
      $set: { lastMessageAt: message.createdAt, lastMessagePreview: preview, lastSenderRole: side },
      $inc: { [otherUnread]: 1 },
    }
  );
  conversation.lastMessagePreview = preview;

  await pushMessage(conversation, message);
  return serializeMessage(message, side);
}

async function markRead(actor, conversationId) {
  const { conversation, side } = await loadConversation(actor, conversationId);
  const field = side === SIDE.CUSTOMER ? 'customerUnread' : 'providerUnread';
  await ProviderConversation.updateOne({ _id: conversation._id }, { $set: { [field]: 0 } });
}

async function unreadCount(actor) {
  if (actor.role === ROLES.SERVICE_PROVIDER && !actor.providerId) return 0;
  const match =
    actor.role === ROLES.SERVICE_PROVIDER
      ? { providerId: toObjectId(actor.providerId) }
      : { customerId: toObjectId(actor._id) };
  const field = actor.role === ROLES.SERVICE_PROVIDER ? 'providerUnread' : 'customerUnread';
  const [row] = await ProviderConversation.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return row ? row.total : 0;
}

module.exports = {
  ProviderChatError,
  SIDE,
  startConversation,
  listConversations,
  listMessages,
  sendMessage,
  markRead,
  unreadCount,
};
