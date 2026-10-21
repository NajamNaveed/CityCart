import { useContext } from 'react'
import { NotificationContext } from '../context/contexts'

// const { unreadCount, refresh, markRead, markAllRead, remove, subscribeChat } = useNotifications()
export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used inside <NotificationProvider>')
  return context
}
