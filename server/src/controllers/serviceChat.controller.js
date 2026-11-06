const {
  sendMessageSchema,
  listMessagesQuerySchema,
  listServiceChatsQuerySchema,
  bookingChatParamSchema,
} = require('../validators/serviceChat.validator');
const {
  ServiceChatError,
  sendMessage,
  listMessages,
  markRead,
  listConversations,
  unreadCount,
  adminListMessages,
} = require('../services/serviceChat.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (err instanceof ServiceChatError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
    });
  }
  return next(err);
}

const actorOf = (req) => ({
  _id: req.user._id,
  role: req.user.role,
  providerId: req.tenantProviderId || (req.provider && req.provider._id),
});

function parseId(req, res) {
  const parsed = bookingChatParamSchema.safeParse(req.params);
  if (!parsed.success) {
    invalid(res, parsed.error);
    return null;
  }
  return parsed.data.id;
}

async function list(req, res, next) {
  const parsed = listServiceChatsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listConversations(actorOf(req), parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function unread(req, res, next) {
  try {
    return res.status(200).json({ success: true, unread: await unreadCount(actorOf(req)) });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function messages(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = listMessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listMessages(actorOf(req), id, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function send(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const message = await sendMessage(actorOf(req), id, parsed.data);
    return res.status(201).json({ success: true, message });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function read(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    await markRead(actorOf(req), id);
    return res.status(200).json({ success: true });
  } catch (err) {
    return handleError(err, res, next);
  }
}

/** Admin read-only view; the audit trail lives in the booking events. */
async function adminMessages(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = listMessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await adminListMessages(id, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = { list, unread, messages, send, read, adminMessages };
