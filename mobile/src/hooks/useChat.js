import { useContext } from 'react'
import { ChatContext } from '../context/contexts'

// const { unread, refreshUnread, subscribe } = useChat()
export function useChat() {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChat must be used inside <ChatProvider>')
  return context
}
