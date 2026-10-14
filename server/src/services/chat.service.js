const mongoose = require('mongoose');

const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const Brand = require('../models/brand.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');
const Employee = require('../models/employee.model');
const { ROLES } = require('../config/roles');
const { PERMISSIONS } = require('../config/permissions');
const { cleanMessageBody } = require('../utils/chatText');
const { emitChat } = require('../sockets');

/**
 * Customer <-> brand chat.
 *
 * Access model (enforced here AND by middleware/chatAccess.js):
 *  - a customer sees only conversations where they are the customer;
 *  - brand staff see only their own brand's conversations;
 *  - anything else is reported as "not found", never "forbidden", so ids
 *    cannot be probed;
 *  - the customer never learns who on the team answered, and the brand only
 *    ever sees the customer's name and avatar (no email, phone or address).
 * Sending needs an ACTIVE brand on both sides, so a suspended or terminated
 * brand stops receiving messages; history stays readable.
 */
class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SIDE = { CUSTOMER: 'CUSTOMER', BRAND: 'BRAND' };
const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_MESSAGE_LIMIT = 30;
const PREVIEW_LENGTH = 100;
const BRAND_CLOSED_MESSAGE = 'This seller is not taking messages right now.';

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

function productSummary(product) {
  if (!product) return null;
  return {
    _id: product._id,
    name: product.name,
    price: product.price,
    image: product.images && product.images[0],
    available: Boolean(product.isActive && product.status === 'ACTIVE'),
  };
}

// A brand-side view also names the team member who replied (accountability
// inside the team); the customer-side view never does.
function serializeMessage(message, side, { products = new Map(), names = new Map() } = {}) {
  return {
    _id: message._id,
    conversationId: message.conversationId,
    senderRole: message.senderRole,
    mine: message.senderRole === side,
    body: message.body,
    createdAt: message.createdAt,
    product: message.productId ? productSummary(products.get(String(message.productId))) : null,
    ...(side === SIDE.BRAND && message.senderRole === SIDE.BRAND && { sentBy: names.get(String(message.senderId)) || 'Team member' }),
  };
}

async function productsById(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const products = await Product.find({ _id: { $in: unique } }, 'name price images isActive status');
  return new Map(products.map((p) => [String(p._id), p]));
}

/** Loads a conversation only if `chat` (see chatAccess) is allowed to see it. */
async function loadConversation(chat, id) {
  const filter =
    chat.side === SIDE.CUSTOMER ? { _id: id, customerId: chat.customerId } : { _id: id, brandId: chat.brandId };
  const conversation = await Conversation.findOne(filter);
  if (!conversation) {
    throw new ChatError(404, 'Conversation not found.');
  }
  return conversation;
}

async function requireOpenBrand(brandId) {
  const brand = await Brand.findById(brandId);
  if (!brand || brand.status !== 'ACTIVE') {
    throw new ChatError(409, BRAND_CLOSED_MESSAGE);
  }
  return brand;
}

/** The brand's own people who may read chats: the owner plus allowed team members. */
async function brandChatRecipients(brandId) {
  const [owners, employees] = await Promise.all([
    User.find({ brandId, role: ROLES.BRAND_ADMIN, isActive: true }, '_id'),
    Employee.find(
      { brandId, isActive: true, permissions: { $in: [PERMISSIONS.MESSAGES_VIEW, PERMISSIONS.MESSAGES_MANAGE] } },
      'userId'
    ),
  ]);
  return [...new Set([...owners.map((u) => String(u._id)), ...employees.map((e) => String(e.userId))])];
}

// Best-effort push: the message is already saved, so a delivery problem must
// never fail the request that sent it.
async function pushMessage(conversation, message, senderName) {
  try {
    const products = await productsById([message.productId]);
    const summary = {
      conversationId: String(conversation._id),
      lastMessageAt: message.createdAt,
      lastMessagePreview: conversation.lastMessagePreview,
    };
    emitChat(conversation.customerId, {
      ...summary,
      message: serializeMessage(message, SIDE.CUSTOMER, { products }),
    });
    const names = new Map([[String(message.senderId), senderName]]);
    const brandView = { ...summary, message: serializeMessage(message, SIDE.BRAND, { products, names }) };
    for (const userId of await brandChatRecipients(conversation.brandId)) {
      emitChat(userId, brandView);
    }
  } catch {
    /* delivery is an enhancement; the next refresh shows the message */
  }
}

async function postMessage(conversation, { sender, side, body, productId }) {
  const text = cleanMessageBody(body);
  if (!text) {
    throw new ChatError(400, 'A message is required.');
  }
  await requireOpenBrand(conversation.brandId);

  if (productId) {
    // Only a visible product of THIS brand can be attached.
    const product = await Product.findOne({
      _id: productId,
      brandId: conversation.brandId,
      isActive: true,
      status: 'ACTIVE',
    });
    if (!product) {
      throw new ChatError(400, 'That product cannot be attached to this conversation.');
    }
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: sender._id,
    senderRole: side,
    body: text,
    ...(productId && { productId }),
  });

  const preview = text.replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH);
  const otherUnread = side === SIDE.CUSTOMER ? 'brandUnread' : 'customerUnread';
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: { lastMessageAt: message.createdAt, lastMessagePreview: preview, lastSenderRole: side },
      $inc: { [otherUnread]: 1 },
    }
  );
  conversation.lastMessagePreview = preview;

  await pushMessage(conversation, message, sender.name);

  const products = await productsById([message.productId]);
  return serializeMessage(message, side, { products, names: new Map([[String(sender._id), sender.name]]) });
}

/**
 * A customer opens (or continues) their thread with the brand that sells
 * `productId` and sends the first message about it.
 */
async function startConversation(customer, { productId, body }) {
  const product = await Product.findOne({ _id: productId, isActive: true, status: 'ACTIVE' });
  if (!product) {
    throw new ChatError(404, 'Product not found.');
  }
  await requireOpenBrand(product.brandId);

  let conversation = await Conversation.findOne({ customerId: customer._id, brandId: product.brandId });
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        customerId: customer._id,
        brandId: product.brandId,
        lastMessageAt: new Date(),
        lastSenderRole: SIDE.CUSTOMER,
      });
    } catch (err) {
      // Two simultaneous first messages: the unique (customer, brand) index
      // lets one win; the other joins the same thread.
      if (err.code !== 11000) throw err;
      conversation = await Conversation.findOne({ customerId: customer._id, brandId: product.brandId });
    }
  }

  const message = await postMessage(conversation, { sender: customer, side: SIDE.CUSTOMER, body, productId });
  return { conversationId: conversation._id, message };
}

/** What the chat page needs when a customer arrives from a product page. */
async function chatContextForProduct(customerId, productId) {
  const product = await Product.findOne({ _id: productId, isActive: true, status: 'ACTIVE' });
  const brand = product && (await Brand.findOne({ _id: product.brandId, status: 'ACTIVE' }, 'name slug logo'));
  if (!product || !brand) {
    throw new ChatError(404, 'Product not found.');
  }
  const conversation = await Conversation.findOne({ customerId, brandId: brand._id }, '_id');
  return {
    product: productSummary(product),
    brand: { _id: brand._id, name: brand.name, logo: brand.logo },
    conversationId: conversation ? conversation._id : null,
  };
}

async function listConversations(chat, { page = 1, limit = DEFAULT_LIST_LIMIT } = {}) {
  const side = chat.side;
  const filter = side === SIDE.CUSTOMER ? { customerId: chat.customerId } : { brandId: chat.brandId };

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Conversation.countDocuments(filter),
  ]);

  // The other party: brand name/logo for a customer, customer name/avatar for a brand.
  let counterpart = new Map();
  if (items.length > 0) {
    if (side === SIDE.CUSTOMER) {
      const brands = await Brand.find({ _id: { $in: items.map((c) => c.brandId) } }, 'name logo status');
      counterpart = new Map(brands.map((b) => [String(b._id), { name: b.name, image: b.logo, open: b.status === 'ACTIVE' }]));
    } else {
      const users = await User.find({ _id: { $in: items.map((c) => c.customerId) } }, 'name avatar');
      counterpart = new Map(users.map((u) => [String(u._id), { name: u.name, image: u.avatar, open: true }]));
    }
  }

  return {
    items: items.map((c) => {
      const other = counterpart.get(String(side === SIDE.CUSTOMER ? c.brandId : c.customerId)) || {
        name: side === SIDE.CUSTOMER ? 'Seller' : 'Customer',
        open: false,
      };
      return {
        _id: c._id,
        with: { name: other.name, image: other.image },
        canSend: other.open,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        unread: side === SIDE.CUSTOMER ? c.customerUnread : c.brandUnread,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

/** Newest-first paging by message id; returned oldest-first for display. */
async function listMessages(chat, conversationId, { before, limit = DEFAULT_MESSAGE_LIMIT } = {}) {
  const conversation = await loadConversation(chat, conversationId);
  const filter = { conversationId: conversation._id, ...(before && { _id: { $lt: before } }) };
  const found = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);

  const hasMore = found.length > limit;
  const page = found.slice(0, limit).reverse();

  const products = await productsById(page.map((m) => m.productId));
  let names = new Map();
  if (chat.side === SIDE.BRAND) {
    const senderIds = [...new Set(page.filter((m) => m.senderRole === SIDE.BRAND).map((m) => String(m.senderId)))];
    if (senderIds.length > 0) {
      const users = await User.find({ _id: { $in: senderIds } }, 'name');
      names = new Map(users.map((u) => [String(u._id), u.name]));
    }
  }

  return {
    messages: page.map((m) => serializeMessage(m, chat.side, { products, names })),
    hasMore,
  };
}

async function sendMessage(chat, conversationId, { body, productId }) {
  const conversation = await loadConversation(chat, conversationId);
  return postMessage(conversation, { sender: chat.user, side: chat.side, body, productId });
}

async function markRead(chat, conversationId) {
  const conversation = await loadConversation(chat, conversationId);
  const field = chat.side === SIDE.CUSTOMER ? 'customerUnread' : 'brandUnread';
  await Conversation.updateOne({ _id: conversation._id }, { $set: { [field]: 0 } });
}

async function unreadCount(chat) {
  const field = chat.side === SIDE.CUSTOMER ? 'customerUnread' : 'brandUnread';
  const match = chat.side === SIDE.CUSTOMER ? { customerId: toObjectId(chat.customerId) } : { brandId: toObjectId(chat.brandId) };
  const [row] = await Conversation.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]);
  return row ? row.total : 0;
}

module.exports = {
  startConversation,
  chatContextForProduct,
  listConversations,
  listMessages,
  sendMessage,
  markRead,
  unreadCount,
  ChatError,
  SIDE,
};
