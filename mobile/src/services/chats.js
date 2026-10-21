import api from './api'

/**
 * Customer chat with sellers (docs/12, /api/v1/chats). All writes go through
 * REST; live arrivals come over the one socket connection (services/socket.js).
 * The server decides who may read or write what; these helpers only shape the
 * calls and answers.
 */

export const CHATS_PAGE_SIZE = 20
export const MESSAGES_PAGE_SIZE = 30

export async function fetchConversations(page = 1) {
  const res = await api.get('/chats', { params: { page, limit: CHATS_PAGE_SIZE } })
  return { items: res.data.conversations || [], pagination: res.data.pagination }
}

export async function fetchChatUnreadCount() {
  const res = await api.get('/chats/unread-count')
  return Number(res.data?.unread) || 0
}

// What the product page hands to the chat: the product, its brand, and an
// existing thread with that brand when there is one.
export async function fetchProductChat(productId) {
  const res = await api.get(`/chats/product/${productId}`)
  return res.data
}

// The first message of a brand-new thread. The server derives the brand from
// the product; nothing else is needed (or accepted).
export async function startChat({ productId, body }) {
  const res = await api.post('/chats/start', { productId, body })
  return res.data
}

export async function fetchMessages(conversationId, { before } = {}) {
  const params = { limit: MESSAGES_PAGE_SIZE }
  if (before) params.before = before
  const res = await api.get(`/chats/${conversationId}/messages`, { params })
  return { messages: res.data.messages || [], hasMore: Boolean(res.data.hasMore) }
}

export async function sendMessage(conversationId, body) {
  const res = await api.post(`/chats/${conversationId}/messages`, { body })
  return res.data.message
}

// Only the caller's side is zeroed, so this is safe whatever else changed.
export async function markConversationRead(conversationId) {
  await api.post(`/chats/${conversationId}/read`)
}

// The server trims and sanitizes too; this keeps empty whitespace drafts from
// becoming requests at all. Inner newlines are kept.
export const cleanMessageBody = (raw) => String(raw ?? '').trim()
