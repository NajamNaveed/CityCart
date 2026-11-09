import api from './api'

/**
 * Direct customer ↔ provider chat (docs/24 §4.5). A thread is not tied to a
 * booking, so a shopper can ask a question before requesting a time. Live
 * messages arrive on the shared socket with `kind: 'PROVIDER'`.
 */

export const PROVIDER_MESSAGES_PAGE_SIZE = 30

export async function startProviderChat(providerId) {
  const res = await api.post('/services/direct-chats/start', { providerId })
  return res.data
}

export async function fetchProviderMessages(conversationId, { before } = {}) {
  const params = { limit: PROVIDER_MESSAGES_PAGE_SIZE }
  if (before) params.before = before
  const res = await api.get(`/services/direct-chats/${conversationId}/messages`, { params })
  return { messages: res.data.messages || [], hasMore: Boolean(res.data.hasMore) }
}

export async function sendProviderMessage(conversationId, body) {
  const res = await api.post(`/services/direct-chats/${conversationId}/messages`, { body })
  return res.data.message
}

export async function markProviderChatRead(conversationId) {
  await api.post(`/services/direct-chats/${conversationId}/read`)
}
