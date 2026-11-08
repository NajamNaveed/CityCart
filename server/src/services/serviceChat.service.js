const mongoose = require('mongoose');

const ServiceBooking = require('../models/serviceBooking.model');
const ServiceProvider = require('../models/serviceProvider.model');
const ServiceConversation = require('../models/serviceConversation.model');
const ServiceMessage = require('../models/serviceMessage.model');
const { ROLES } = require('../config/roles');
const { CHAT_OPEN_STATUSES } = require('../config/serviceBookingStatuses');
const { cleanMessageBody } = require('../utils/chatText');
const { emitChat } = require('../sockets');

/**
 * Booking-scoped service chat (docs/24 §4.5). Access is booking membership:
 * the booking's customer, the provider that owns the booking, or a super
 * admin reading through the admin endpoint. Anything else answers 404, never
 * "forbidden", so booking ids cannot be probed.
 *
 * A conversation is created when the provider accepts (or when the first
 * message is sent) and messages are immutable. Contact sharing is allowed
 * after acceptance; the chat is never public.
 */
class ServiceChatError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SIDE = { CUSTOMER: 'CUSTOMER', PROVIDER: 'PROVIDER', SYSTEM: 'SYSTEM' };
const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_MESSAGE_LIMIT = 30;
const PREVIEW_LENGTH = 100;
const CHAT_CLOSED_MESSAGE = 'Chat opens once the provider accepts this booking.';

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

function sideFor(booking, actor) {
  if (!actor) return null;
  if (String(booking.customerId) === String(actor._id)) return SIDE.CUSTOMER;
  if (actor.role === ROLES.SERVICE_PROVIDER && actor.providerId && String(booking.providerId) === String(actor.providerId)) {
    return SIDE.PROVIDER;
  }
  return null;
}

function serializeMessage(message, side) {
  return {
    _id: message._id,
    conversationId: message.conversationId,
    senderRole: message.senderRole,
    mine: message.senderRole === side,
    body: message.body || '',
    attachments: message.attachments || [],
    createdAt: message.createdAt,
  };
}

function previewOf(body, attachments) {
  if (body) return body.replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH);
  return attachments && attachments.length ? 'Photo' : '';
}

/**
 * Loads a booking the actor may chat in, or throws 404. Customers and
 * providers get their own tenant scope; a provider can never load another
 * provider's booking even by guessing its id.
 */
async function loadChatBooking(actor, bookingId) {
  const booking = await ServiceBooking.findById(bookingId);
  if (!booking) throw new ServiceChatError(404, 'Booking not found.');
  const side = sideFor(booking, actor);
  if (!side) throw new ServiceChatError(404, 'Booking not found.');
  return { booking, side };
}

async function ensureConversation(booking) {
  let conversation = await ServiceConversation.findOne({ bookingId: booking._id });
  if (conversation) return conversation;
  try {
    conversation = await ServiceConversation.create({
      bookingId: booking._id,
      customerId: booking.customerId,
      providerId: booking.providerId,
      lastMessageAt: new Date(),
      lastSenderRole: SIDE.SYSTEM,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    conversation = await ServiceConversation.findOne({ bookingId: booking._id });
  }
  if (!booking.conversationId) {
    await ServiceBooking.updateOne(
      { _id: booking._id, conversationId: null },
      { $set: { conversationId: conversation._id } }
    );
  }
  return conversation;
}

/** Called when a booking becomes ACCEPTED: opens the thread with a system line. */
async function openBookingChat(booking, body = 'Booking accepted. You can chat here about the job.') {
  const conversation = await ensureConversation(booking);
  const exists = await ServiceMessage.exists({
    conversationId: conversation._id,
    senderRole: SIDE.SYSTEM,
    body,
  });
  if (!exists) {
    await ServiceMessage.create({
      conversationId: conversation._id,
      senderRole: SIDE.SYSTEM,
      body,
    });
    await ServiceConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessageAt: new Date(),
          lastMessagePreview: body,
          lastSenderRole: SIDE.SYSTEM,
        },
      }
    );
  }
  return conversation;
}

async function pushMessage(conversation, message, booking) {
  try {
    const summary = {
      kind: 'SERVICE_BOOKING',
      conversationId: String(conversation._id),
      bookingId: String(booking._id),
      lastMessageAt: message.createdAt,
      lastMessagePreview: conversation.lastMessagePreview,
    };
    const customerView = { ...summary, message: serializeMessage(message, SIDE.CUSTOMER) };
    emitChat(conversation.customerId, customerView);

    const provider = await ServiceProvider.findById(conversation.providerId).select('userId');
    if (provider) {
      emitChat(provider.userId, { ...summary, message: serializeMessage(message, SIDE.PROVIDER) });
    }
  } catch {
    /* delivery is an enhancement; the next refresh shows the message */
  }
}

async function postMessage(booking, conversation, side, sender, { body, attachments }) {
  const text = cleanMessageBody(body || '');
  const files = attachments || [];
  if (!text && files.length === 0) {
    throw new ServiceChatError(400, 'Write a message or attach a photo.');
  }

  const message = await ServiceMessage.create({
    conversationId: conversation._id,
    senderId: sender._id,
    senderRole: side,
    ...(text && { body: text }),
    ...(files.length && { attachments: files }),
  });

  const preview = previewOf(text, files);
  const otherUnread = side === SIDE.CUSTOMER ? 'providerUnread' : 'customerUnread';
  await ServiceConversation.updateOne(
    { _id: conversation._id },
    {
      $set: { lastMessageAt: message.createdAt, lastMessagePreview: preview, lastSenderRole: side },
      $inc: { [otherUnread]: 1 },
    }
  );
  conversation.lastMessagePreview = preview;

  await pushMessage(conversation, message, booking);
  return serializeMessage(message, side);
}

async function sendMessage(actor, bookingId, input) {
  const { booking, side } = await loadChatBooking(actor, bookingId);
  if (!CHAT_OPEN_STATUSES.includes(booking.status)) {
    throw new ServiceChatError(409, CHAT_CLOSED_MESSAGE, 'CHAT_NOT_OPEN');
  }
  const conversation = await ensureConversation(booking);
  return postMessage(booking, conversation, side, actor, input);
}

async function listMessages(actor, bookingId, { before, limit = DEFAULT_MESSAGE_LIMIT } = {}) {
  const { booking, side } = await loadChatBooking(actor, bookingId);
  if (!CHAT_OPEN_STATUSES.includes(booking.status) && !booking.conversationId) {
    return { messages: [], hasMore: false };
  }
  const conversation = await ensureConversation(booking);
  const filter = { conversationId: conversation._id, ...(before && { _id: { $lt: before } }) };
  const found = await ServiceMessage.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = found.length > limit;
  const page = found.slice(0, limit).reverse();
  return { messages: page.map((m) => serializeMessage(m, side)), hasMore };
}

async function markRead(actor, bookingId) {
  const { booking, side } = await loadChatBooking(actor, bookingId);
  const conversation = await ServiceConversation.findOne({ bookingId: booking._id });
  if (!conversation) return;
  const field = side === SIDE.CUSTOMER ? 'customerUnread' : 'providerUnread';
  await ServiceConversation.updateOne({ _id: conversation._id }, { $set: { [field]: 0 } });
}

/**
 * The signed-in customer's or provider's chat list. Counterpart names come
 * from the booking snapshots, so a customer never sees a provider's private
 * address and a provider only sees the name the customer shared for the job.
 */
async function listConversations(actor, { page = 1, limit = DEFAULT_LIST_LIMIT } = {}) {
  let filter;
  if (actor.role === ROLES.SERVICE_PROVIDER) {
    if (!actor.providerId) return { items: [], pagination: { page, limit, total: 0, pages: 0 } };
    filter = { providerId: actor.providerId };
  } else {
    filter = { customerId: actor._id };
  }

  const [rows, total] = await Promise.all([
    ServiceConversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ServiceConversation.countDocuments(filter),
  ]);

  const bookings = rows.length
    ? await ServiceBooking.find({ _id: { $in: rows.map((c) => c.bookingId) } }).select(
        'bookingNumber offering.title address.fullName providerId customerId status'
      )
    : [];
  const bookingById = new Map(bookings.map((b) => [String(b._id), b]));
  const providerIds = [...new Set(rows.map((c) => String(c.providerId)))];
  const providers = providerIds.length
    ? await ServiceProvider.find({ _id: { $in: providerIds } }).select('displayName avatar slug')
    : [];
  const providerById = new Map(providers.map((p) => [String(p._id), p]));

  return {
    items: rows.map((c) => {
      const booking = bookingById.get(String(c.bookingId));
      const provider = providerById.get(String(c.providerId));
      const isProviderSide = actor.role === ROLES.SERVICE_PROVIDER;
      return {
        _id: c._id,
        bookingId: c.bookingId,
        bookingNumber: booking ? booking.bookingNumber : undefined,
        serviceTitle: booking ? booking.offering.title : 'Service',
        status: booking ? booking.status : undefined,
        with: isProviderSide
          ? {
              name: booking ? booking.address.fullName : 'Customer',
              image: null,
            }
          : {
              name: provider ? provider.displayName : 'Service provider',
              image: provider ? provider.avatar : null,
              slug: provider ? provider.slug : undefined,
            },
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        unread: isProviderSide ? c.providerUnread : c.customerUnread,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function unreadCount(actor) {
  const match =
    actor.role === ROLES.SERVICE_PROVIDER
      ? { providerId: toObjectId(actor.providerId) }
      : { customerId: toObjectId(actor._id) };
  const field = actor.role === ROLES.SERVICE_PROVIDER ? 'providerUnread' : 'customerUnread';
  const [row] = await ServiceConversation.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
  return row ? row.total : 0;
}

/** Admin read-only view of a booking's thread (docs/24 §4.5). */
async function adminListMessages(bookingId, { before, limit = DEFAULT_MESSAGE_LIMIT } = {}) {
  const booking = await ServiceBooking.findById(bookingId);
  if (!booking) throw new ServiceChatError(404, 'Booking not found.');
  const conversation = await ServiceConversation.findOne({ bookingId: booking._id });
  if (!conversation) return { messages: [], hasMore: false };
  const filter = { conversationId: conversation._id, ...(before && { _id: { $lt: before } }) };
  const found = await ServiceMessage.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = found.length > limit;
  const page = found.slice(0, limit).reverse();
  return {
    messages: page.map((m) => ({ ...serializeMessage(m, 'ADMIN'), mine: false })),
    hasMore,
  };
}

module.exports = {
  ServiceChatError,
  SIDE,
  openBookingChat,
  sendMessage,
  listMessages,
  markRead,
  listConversations,
  unreadCount,
  adminListMessages,
};
