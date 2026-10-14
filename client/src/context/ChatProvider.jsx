import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import useNotifications from '../hooks/useNotifications'
import { ChatContext } from './contexts'

// Customers and the brand team members who may read chats. The server decides
// for real on every request; this only avoids pointless calls.
function usesChat(user) {
  if (!user) return false
  if (user.role === 'CUSTOMER' || user.role === 'BRAND_ADMIN') return true
  return user.role === 'BRAND_EMPLOYEE' && ['messages.view', 'messages.manage'].some((p) => user.permissions?.includes(p))
}

/**
 * The unread-messages count for the navbar and the brand sidebar, kept fresh
 * from the shared socket. The count always comes from the server (an event
 * just triggers a re-read), so it can never drift from the database.
 */
export function ChatProvider({ children }) {
  const { user } = useAuth()
  const { subscribeChat } = useNotifications()
  const [state, setState] = useState({ userId: null, unread: 0 })
  const timer = useRef(null)
  const enabled = usesChat(user)
  const userId = user?.id

  const refreshUnread = useCallback(async () => {
    if (!enabled) return
    try {
      const res = await api.get('/chats/unread-count')
      setState({ userId, unread: Number(res.data?.unread) || 0 })
    } catch {
      /* keep the last known count */
    }
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    api
      .get('/chats/unread-count')
      .then((res) => active && setState({ userId, unread: Number(res.data?.unread) || 0 }))
      .catch(() => {})

    // A burst of messages triggers one re-read, not one per message.
    const unsubscribe = subscribeChat(() => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => active && refreshUnread(), 300)
    })
    const onVisible = () => {
      if (active && document.visibilityState === 'visible') refreshUnread()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      clearTimeout(timer.current)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, userId, subscribeChat, refreshUnread])

  const value = useMemo(
    () => ({
      // A signed-out visitor, or another user before their first read lands, sees 0.
      unread: enabled && state.userId === userId ? state.unread : 0,
      refreshUnread,
      subscribe: subscribeChat,
    }),
    [enabled, state, userId, refreshUnread, subscribeChat],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
