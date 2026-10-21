import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { fetchChatUnreadCount } from '../services/chats'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import { ChatContext } from './contexts'

/**
 * The unread-messages count for the Account tab, kept fresh over the shared
 * socket: an event never sets the count, it just triggers a re-read, so the
 * number can never drift from the database.
 */
export function ChatProvider({ children }) {
  const { user } = useAuth()
  const { subscribeChat } = useNotifications()
  const enabled = user?.role === 'CUSTOMER'
  const userId = user?.id
  const [state, setState] = useState({ userId: null, unread: 0 })
  const timer = useRef(null)

  const refreshUnread = useCallback(async () => {
    if (!enabled) return
    try {
      const unread = await fetchChatUnreadCount()
      setState({ userId, unread })
    } catch {
      // Keep the last known count.
    }
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    fetchChatUnreadCount()
      .then((unread) => active && setState({ userId, unread }))
      .catch(() => {})

    // A burst of messages triggers one re-read, not one per message.
    const unsubscribe = subscribeChat(() => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => active && refreshUnread(), 300)
    })
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshUnread()
    })
    return () => {
      active = false
      clearTimeout(timer.current)
      appState.remove()
      unsubscribe()
    }
  }, [enabled, userId, subscribeChat, refreshUnread])

  const value = useMemo(
    () => ({
      unread: enabled && state.userId === userId ? state.unread : 0,
      refreshUnread,
      subscribe: subscribeChat,
    }),
    [enabled, state, userId, refreshUnread, subscribeChat],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
