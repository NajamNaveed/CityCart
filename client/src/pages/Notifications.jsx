import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import useNotifications from '../hooks/useNotifications'
import { useAuth } from '../hooks/useAuth'
import { formatDateTime } from '../ui'

const PAGE_SIZE = 20

const homePathFor = (role) =>
  role === 'SUPER_ADMIN' ? '/admin' : role === 'CUSTOMER' ? '/' : '/brand'

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

export default function Notifications() {
  const { user } = useAuth()
  const { markRead, markAllRead, remove } = useNotifications()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [error, setError] = useState('')

  // "Loading" is derived: no page of results has arrived yet.
  const loading = !pagination && !error

  useEffect(() => {
    let active = true
    api
      .get('/notifications', { params: { page, limit: PAGE_SIZE } })
      .then((res) => {
        if (!active) return
        setItems(res.data.notifications)
        setPagination(res.data.pagination)
        setError('')
      })
      .catch((err) => {
        if (!active) return
        setError(err.response?.data?.message || 'Could not load your notifications.')
      })
    return () => {
      active = false
    }
  }, [page])

  async function onItemClick(notification) {
    if (!notification.isRead) {
      try {
        await markRead(notification._id)
        setItems((prev) => prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n)))
      } catch {
        // badge sync is best-effort; the click-through still happens
      }
    }
    const to = targetFor(notification, user)
    if (to) window.location.assign(to)
  }

  async function onDelete(notification) {
    try {
      await remove(notification._id)
      setItems((prev) => prev.filter((n) => n._id !== notification._id))
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the notification.')
    }
  }

  async function onMarkAllRead() {
    try {
      await markAllRead()
      setItems((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true })))
    } catch (err) {
      setError(err.response?.data?.message || 'Could not mark everything read.')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Account</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Notifications</h1>
        </div>
        <Link to={homePathFor(user.role)} className="text-[13px] font-medium text-clay hover:text-clay-dark">
          ← Back
        </Link>
      </div>

      {error && <p className="mt-4 rounded-sm border border-clay bg-clay/5 px-4 py-2 text-sm text-clay">{error}</p>}

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          Nothing here yet — order updates, stock alerts and reviews will land here.
        </p>
      ) : (
        <>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-[12px] font-medium uppercase tracking-[0.08em] text-clay hover:text-clay-dark"
            >
              Mark all read
            </button>
          </div>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {items.map((n) => (
              <li key={n._id} className={n.isRead ? '' : 'bg-cream/60'}>
                <div className="flex items-start gap-3 px-1 py-4">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-clay'}`}
                  />
                  <button type="button" onClick={() => onItemClick(n)} className="min-w-0 flex-1 text-left">
                    <p className={`text-[14px] ${n.isRead ? 'text-ink' : 'font-semibold text-ink'}`}>{n.title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted/70">{formatDateTime(n.createdAt)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(n)}
                    aria-label="Delete notification"
                    className="mt-1 text-[15px] leading-none text-muted/60 hover:text-clay"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {pagination && pagination.pages > 1 && (
            <div className="mt-6 flex items-center justify-between text-[13px]">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="font-medium text-clay disabled:opacity-40"
              >
                ← Newer
              </button>
              <span className="text-muted">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="font-medium text-clay disabled:opacity-40"
              >
                Older →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
