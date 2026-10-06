import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { NotificationContext } from './contexts'

// How many notifications the bell keeps locally; the full inbox page pages
// through the API itself.
const BELL_LIMIT = 10

// The socket connects to the API origin (VITE_API_URL without its /api/v1 tail).
function resolveSocketUrl() {
  const raw = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').trim().replace(/\/+$/, '')
  return raw.replace(/\/api\/v\d+$/, '')
}

/**
 * Real-time notifications (docs/12): the DB record is the source of truth —
 * this provider keeps a small recent list for the bell, the unread count, and
 * a socket connection that prepends pushes as they arrive. Everything is
 * re-fetched on login, on socket reconnect, and when the tab becomes visible
 * again, so a missed push is healed by the next refresh.
 */
export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  // Whose notifications `items` holds. A signed-out visitor (or a different
  // user before their first fetch lands) always derives an empty bell.
  const [sessionKey, setSessionKey] = useState(null)
  const itemsRef = useRef([])

  // Mirrored through an effect so `remove()` can see the item it deletes.
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/notifications', { params: { page: 1, limit: BELL_LIMIT } })
      setItems(res.data.notifications)
      setUnreadCount(res.data.unreadCount)
      setSessionKey(user.id)
    } catch {
      // The bell simply keeps whatever it had (e.g. momentary network loss).
    }
  }, [user])

  useEffect(() => {
    if (!user) return undefined

    let active = true

    // The server identifies the connection by the same HTTP-only auth cookie
    // as every API call — no token ever reaches JS-reachable storage.
    const socket = io(resolveSocketUrl(), { withCredentials: true })
    socket.on('notification', (notification) => {
      if (!active) return
      setItems((prev) => [notification, ...prev].slice(0, BELL_LIMIT))
      setUnreadCount((count) => count + 1)
    })
    // Catch up after a reconnect or a hidden tab.
    socket.on('connect', () => {
      if (active) refresh()
    })
    const onVisible = () => {
      if (active && document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    // Initial fetch, inlined like every other provider (setState only in the
    // promise callbacks, never synchronously inside the effect).
    api
      .get('/notifications', { params: { page: 1, limit: BELL_LIMIT } })
      .then((res) => {
        if (!active) return
        setItems(res.data.notifications)
        setUnreadCount(res.data.unreadCount)
        setSessionKey(user.id)
      })
      .catch(() => {})

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      socket.disconnect()
    }
  }, [user, refresh])

  const markRead = useCallback(async (id) => {
    const res = await api.patch(`/notifications/${id}/read`)
    setItems((prev) => prev.map((n) => (n._id === id ? res.data.notification : n)))
    setUnreadCount((count) => Math.max(0, count - 1))
    return res.data.notification
  }, [])

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all')
    setItems((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true })))
    setUnreadCount(0)
  }, [])

  const remove = useCallback(async (id) => {
    const target = itemsRef.current.find((n) => n._id === id)
    await api.delete(`/notifications/${id}`)
    setItems((prev) => prev.filter((n) => n._id !== id))
    if (target && !target.isRead) setUnreadCount((count) => Math.max(0, count - 1))
  }, [])

  const value = useMemo(() => {
    const mine = user && sessionKey === user.id
    return {
      notifications: mine ? items : [],
      unreadCount: mine ? unreadCount : 0,
      refresh,
      markRead,
      markAllRead,
      remove,
    }
  }, [user, sessionKey, items, unreadCount, refresh, markRead, markAllRead, remove])

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
