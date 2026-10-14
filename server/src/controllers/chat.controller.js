const {
  startChatSchema,
  sendMessageSchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
} = require('../validators/chat.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const service = require('../services/chat.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function sendError(err, res, next) {
  if (err instanceof service.ChatError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

async function listChats(req, res, next) {
  const query = listChatsQuerySchema.safeParse(req.query);
  if (!query.success) return invalid(res, query.error);
  try {
    const { items, pagination } = await service.listConversations(req.chat, query.data);
    return res.status(200).json({ success: true, conversations: items, pagination });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function unread(req, res, next) {
  try {
    return res.status(200).json({ success: true, unread: await service.unreadCount(req.chat) });
  } catch (err) {
    return next(err);
  }
}

async function productContext(req, res, next) {
  const params = objectIdParamSchema.safeParse({ id: req.params.productId });
  if (!params.success) return invalid(res, params.error);
  try {
    const context = await service.chatContextForProduct(req.chat.customerId, params.data.id);
    return res.status(200).json({ success: true, ...context });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function start(req, res, next) {
  const body = startChatSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const result = await service.startConversation(req.chat.user, body.data);
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function messages(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const query = listMessagesQuerySchema.safeParse(req.query);
  if (!query.success) return invalid(res, query.error);
  try {
    const result = await service.listMessages(req.chat, params.data.id, query.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function send(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = sendMessageSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);
  try {
    const message = await service.sendMessage(req.chat, params.data.id, body.data);
    return res.status(201).json({ success: true, message });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function read(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  try {
    await service.markRead(req.chat, params.data.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    return sendError(err, res, next);
  }
}

module.exports = { listChats, unread, productContext, start, messages, send, read };
