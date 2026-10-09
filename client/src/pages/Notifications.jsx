import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  Star,
  Trash2,
  Truck,
} from 'lucide-react'
import api from '../services/api'
import useNotifications from '../hooks/useNotifications'
import { useAuth } from '../hooks/useAuth'
import { EmptyState, Skeleton } from '../components/ui'
import { btnPrimary, formatDateTime, wrap } from '../ui'

const PAGE_SIZE = 20

const homePathFor = (role) =>
  role === 'SUPER_ADMIN' ? '/admin' : role === 'CUSTOMER' ? '/' : '/brand'

// Where a notification click should land, per role.
function targetFor(notification, user) {
  const data = notification?.data || {}
  if (data.orderId) {
    if (user?.role === 'CUSTOMER') return `/orders/${data.orderId}`
    if (user?.role === 'SUPER_ADMIN') return `/admin/orders/${data.orderId}`
    return `/brand/orders/${data.orderId}`
  }
  return null
}

function getNotificationVisuals(type = '') {
  if (type.includes('DELIVER') || type === 'ORDER_SHIPPED' || type === 'ORDER_OUT_FOR_DELIVERY') {
    return {
      Icon: Truck,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
      badge: 'Delivery',
    }
  }
  if (type.includes('ORDER') || type.includes('PAYMENT') || type.includes('REFUND')) {
    return {
      Icon: Package,
      color: 'bg-amber-50 text-amber-700 border-amber-200/60',
      badge: 'Order',
    }
  }
  if (type.includes('REVIEW')) {
    return {
      Icon: Star,
      color: 'bg-orange-50 text-orange-700 border-orange-200/60',
      badge: 'Review',
    }
  }
  if (type.includes('STOCK')) {
    return {
      Icon: AlertCircle,
      color: 'bg-rose-50 text-rose-700 border-rose-200/60',
      badge: 'Inventory',
    }
  }
  return {
    Icon: Bell,
    color: 'bg-slate-50 text-slate-700 border-slate-200/60',
    badge: 'Update',
  }
}

export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { markRead, markAllRead, remove } = useNotifications()
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  const loading = !pagination && !error
  const isCustomer = user?.role === 'CUSTOMER'

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
        // badge sync is best-effort
      }
    }
    const to = targetFor(notification, user)
    if (to) navigate(to)
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

  const displayedItems = filter === 'unread' ? items.filter((n) => !n.isRead) : items
  const localUnreadCount = items.filter((n) => !n.isRead).length

  const content = (
    <>
      {/* Header */}
      {isCustomer ? (
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to shopping
          </Link>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Your account</p>
              <div className="mt-1 flex items-center gap-3">
                <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  Notifications
                </h1>
                {localUnreadCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-semibold text-clay">
                    {localUnreadCount} new
                  </span>
                )}
              </div>
            </div>

            {items.length > 0 && localUnreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-ink transition hover:border-clay hover:text-clay hover:shadow-xs active:scale-95"
              >
                <CheckCheck className="h-3.5 w-3.5 text-clay" />
                Mark all as read
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Account</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Notifications
              </h1>
              {localUnreadCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-semibold text-clay">
                  {localUnreadCount} unread
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {items.length > 0 && localUnreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink transition hover:border-clay hover:text-clay"
              >
                <CheckCheck className="h-3.5 w-3.5 text-clay" />
                Mark all read
              </button>
            )}
            <Link
              to={homePathFor(user?.role)}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm text-clay">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      {!loading && items.length > 0 && (
        <div className="mb-6 flex items-center gap-2 border-b border-line pb-3">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
              filter === 'all'
                ? 'bg-ink text-white shadow-xs'
                : 'text-muted hover:bg-paper hover:text-ink'
            }`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
              filter === 'unread'
                ? 'bg-ink text-white shadow-xs'
                : 'text-muted hover:bg-paper hover:text-ink'
            }`}
          >
            Unread ({localUnreadCount})
          </button>
        </div>
      )}

      {/* Content States */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl border border-line/80 bg-white p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3 rounded" />
                <Skeleton className="h-3.5 w-3/4 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          message={
            isCustomer
              ? 'When you place orders or receive delivery updates, they will appear right here.'
              : 'Important store activity, inventory alerts, and updates will be listed here.'
          }
          className="rounded-2xl border border-line/70 bg-white py-16"
          action={
            isCustomer ? (
              <Link to="/shop" className={btnPrimary}>
                Explore marketplace
              </Link>
            ) : null
          }
        />
      ) : displayedItems.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="All caught up!"
          message="You have no unread notifications right now."
          className="rounded-2xl border border-line/70 bg-white py-12"
          action={
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="text-xs font-semibold uppercase tracking-wider text-clay hover:underline"
            >
              View all notifications
            </button>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {displayedItems.map((n) => {
              const { Icon, color, badge } = getNotificationVisuals(n.type)
              const to = targetFor(n, user)

              return (
                <div
                  key={n._id}
                  className={`group relative flex items-start gap-3.5 rounded-xl border p-4 sm:gap-4 sm:p-5 transition-all duration-200 ${
                    n.isRead
                      ? 'border-line/80 bg-white hover:border-ink/20 hover:shadow-xs'
                      : 'border-clay/30 bg-gradient-to-r from-cream/40 to-white shadow-xs hover:border-clay/50 hover:shadow-sm'
                  }`}
                >
                  {/* Visual Icon Badge */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${color} shadow-xs`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {badge}
                      </span>
                      {!n.isRead && (
                        <span className="h-2 w-2 rounded-full bg-clay" aria-label="Unread" />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className="mt-1.5 block text-left text-[14.5px] font-medium tracking-tight text-ink transition hover:text-clay"
                    >
                      {n.title}
                    </button>

                    <p
                      onClick={() => onItemClick(n)}
                      className="mt-1 cursor-pointer text-[13px] leading-relaxed text-muted transition hover:text-ink"
                    >
                      {n.message}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-muted/75">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(n.createdAt)}
                      </span>
                      {to && (
                        <button
                          type="button"
                          onClick={() => onItemClick(n)}
                          className="inline-flex items-center gap-1 font-semibold text-clay transition hover:underline"
                        >
                          View order details
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delete Action */}
                  <button
                    type="button"
                    onClick={() => onDelete(n)}
                    aria-label="Delete notification"
                    title="Delete notification"
                    className="rounded-lg p-1.5 text-muted/40 transition hover:bg-clay/10 hover:text-clay"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-line/70 pt-4 text-xs font-medium">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-ink transition hover:bg-paper disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-muted">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-ink transition hover:bg-paper disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </>
  )

  if (isCustomer) {
    return <div className={`${wrap} max-w-4xl py-10`}>{content}</div>
  }

  return <div>{content}</div>
}
