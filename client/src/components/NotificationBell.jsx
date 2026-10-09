import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useNotifications from '../hooks/useNotifications'
import { useAuth } from '../hooks/useAuth'

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// "2 h ago" style stamps; older ones get a plain date.
function timeAgo(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`
  return new Date(value).toLocaleDateString()
}

// Where a notification click should land, per role.
function targetFor(notification, user) {
  const data = notification.data || {}
  if (data.orderId) {
    if (user.role === 'CUSTOMER') return `/orders/${data.orderId}`
    if (user.role === 'SUPER_ADMIN') return `/admin/orders/${data.orderId}`
    return `/brand/orders/${data.orderId}`
  }
  return null
}

const inboxPathFor = (role) =>
  role === 'SUPER_ADMIN' ? '/admin/notifications' : role === 'CUSTOMER' ? '/notifications' : '/brand/notifications'

export default function NotificationBell() {
  const { user } = useAuth()
  const { notifications, unreadCount, markRead, markAllRead, remove } = useNotifications()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const navigate = useNavigate()

  // Close when clicking anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return undefined
    const onClickAway = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function onItemClick(notification) {
    setOpen(false)
    if (!notification.isRead) {
      markRead(notification._id).catch(() => {})
    }
    const to = targetFor(notification, user)
    if (to) navigate(to)
  }

  if (!user) return null

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-sm text-ink transition hover:text-clay"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none text-cream">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-[calc(100vw-2rem)] max-w-xs rounded-xl border border-line bg-paper shadow-xl shadow-ink/10 overflow-hidden sm:w-80 sm:max-w-none">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead().catch(() => {})}
                className="text-[11px] font-medium text-clay hover:text-clay-dark"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing here yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n._id} className={`border-b border-line last:border-b-0 ${n.isRead ? '' : 'bg-cream'}`}>
                  <div className="flex items-start gap-2 px-4 py-3">
                    <button type="button" onClick={() => onItemClick(n)} className="min-w-0 flex-1 text-left">
                      <p className={`truncate text-[13px] ${n.isRead ? 'text-ink' : 'font-semibold text-ink'}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">{n.message}</p>
                      <p className="mt-1 text-[11px] text-muted/70">{timeAgo(n.createdAt)}</p>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete notification"
                      onClick={() => remove(n._id).catch(() => {})}
                      className="mt-0.5 text-[13px] leading-none text-muted/60 hover:text-clay"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate(inboxPathFor(user.role))
            }}
            className="block w-full border-t border-line px-4 py-2.5 text-center text-[12px] font-medium text-clay hover:text-clay-dark"
          >
            View all
          </button>
        </div>
      )}
    </div>
  )
}
