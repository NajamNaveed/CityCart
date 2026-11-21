import { getErrorMessage } from '../services/api'

// AI drafting fails for a few reasons the person can act on. The server's code
// says which, so the UI explains it instead of showing a bare "Request failed".
export function draftErrorMessage(err) {
  const code = err.response?.data?.code
  if (code === 'AI_UNAVAILABLE') return 'Drafting is unavailable right now.'
  if (code === 'AI_DAILY_LIMIT') return 'You have used today’s AI requests. Try again tomorrow.'
  if (code === 'CHAT_NOT_OPEN') return 'This booking’s chat is closed.'
  if (code === 'NOTHING_TO_ANSWER') return 'There is no customer message to answer yet.'
  return getErrorMessage(err)
}
