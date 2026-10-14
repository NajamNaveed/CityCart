import { useContext } from 'react'
import { ChatContext } from '../context/contexts'

// const { unread, refreshUnread, subscribe } = useChat()
export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>')
  return ctx
}
