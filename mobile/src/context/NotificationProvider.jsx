import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import api from '../services/api'
import { markAllNotificationsRead, markNotificationRead, deleteNotification } from '../services/notifications'
import { closeLiveConnection, createLiveConnection } from '../services/socket'
import { useAuth } from '../hooks/useAuth'
import { NotificationContext } from './contexts'

/**
 * Real-time notifications (docs/12). The database record is the source of
 * truth: this provider keeps only the unread count for the badge, plus the one
 * socket connection that bumps it as pushes arrive — and that chat screens
 * subscribe to for live messages. The count is re-read from the server on
 * connect, when the app returns to the foreground and after every action, so a
 * missed push heals itself instead of drifting.
 *
 * The mobile app is shoppers only, and the server hands a handshake token to
 * customers alone, so that is the whole audience here.
 */
export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const enabled = user?.role === 'CUSTOMER'
  const userId = user?.id
  const [state, setState] = useState({ userId: null, unreadCount: 0 })
  // Chat shares this one connection: chat screens subscribe here for live
  // messages instead of opening a socket each.
  const chatListeners = useRef(new Set())

  const subscribeChat = useCallback((listener) => {
    chatListeners.current.add(listener)
    return () => chatListeners.current.delete(listener)
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      // The answer's shape matters, not its rows; one row is enough for the count.
      const res = await api.get('/notifications', { params: { page: 1, limit: 1 } })
      setState({ userId, unreadCount: Number(res.data?.unreadCount) || 0 })
    } catch {
      // A momentary network loss keeps the last known count.
    }
  }, [enabled, userId])

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    let connectedBefore = false

    const socket = createLiveConnection()
    if (socket) {
      socket.on('notification', () => {
        if (active) setState((s) => ({ ...s, unreadCount: s.unreadCount + 1 }))
      })
      socket.on('chat:message', (payload) => {
        if (active) chatListeners.current.forEach((listener) => listener('message', payload))
      })
      socket.on('connect', () => {
        if (!active) return
        refresh()
        // After a dropped connection chat may have missed pushes: tell it to re-read.
        if (connectedBefore) chatListeners.current.forEach((listener) => listener('resync'))
        connectedBefore = true
      })
    }

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh()
    })
    // Initial read, inlined: setState only ever runs in the promise callbacks,
    // never synchronously inside the effect. The 'connect' handler below
    // re-reads anyway; this covers "no socket" and the moment before it.
    api
      .get('/notifications', { params: { page: 1, limit: 1 } })
      .then((res) => {
        if (active) setState({ userId, unreadCount: Number(res.data?.unreadCount) || 0 })
      })
      .catch(() => {})

    return () => {
      active = false
      appState.remove()
      closeLiveConnection(socket)
    }
  }, [enabled, userId, refresh])

  const markRead = useCallback(async (id) => {
    await markNotificationRead(id)
    setState((s) => ({ ...s, unreadCount: Math.max(0, s.unreadCount - 1) }))
  }, [])

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead()
    setState((s) => ({ ...s, unreadCount: 0 }))
  }, [])

  const remove = useCallback(async (id, wasUnread) => {
    await deleteNotification(id)
    if (wasUnread) setState((s) => ({ ...s, unreadCount: Math.max(0, s.unreadCount - 1) }))
  }, [])

  const mine = enabled && state.userId === userId
  const value = useMemo(
    () => ({
      // A signed-out visitor, or another user before their first read lands, sees 0.
      unreadCount: mine ? state.unreadCount : 0,
      refresh,
      markRead,
      markAllRead,
      remove,
      subscribeChat,
    }),
    [mine, state.unreadCount, refresh, markRead, markAllRead, remove, subscribeChat],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
