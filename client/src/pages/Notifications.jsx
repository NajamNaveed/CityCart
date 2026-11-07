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
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Tabs,
  card,
  eyebrow,
  shell,
} from '../design'
import { formatDateTime } from '../ui'

const PAGE_SIZE = 20

const homePathFor = (role) =>
  role === 'SUPER_ADMIN' || role === 'ADMIN_PARTNER' ? '/admin' : role === 'CUSTOMER' ? '/' : '/brand'

// Where a notification click should land, per role.
function targetFor(notification, user) {
  const data = notification?.data || {}
  if (data.orderId) {
    if (user?.role === 'CUSTOMER') return `/orders/${data.orderId}`
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN_PARTNER') return `/admin/orders/${data.orderId}`
    return `/brand/orders/${data.orderId}`
  }
  return null
}

function getNotificationVisuals(type = '') {
  if (type.includes('DELIVER') || type === 'ORDER_SHIPPED' || type === 'ORDER_OUT_FOR_DELIVERY') {
    return { Icon: Truck, tone: 'bg-sage text-forest', badge: 'Delivery' }
  }
  if (type.includes('ORDER') || type.includes('PAYMENT') || type.includes('REFUND') || type.includes('ADJUSTMENT')) {
    return { Icon: Package, tone: 'bg-sand text-clay', badge: 'Order' }
  }
  if (type.includes('REVIEW')) {
    return { Icon: Star, tone: 'bg-cream text-noir', badge: 'Review' }
  }
  if (type.includes('STOCK')) {
    return { Icon: AlertCircle, tone: 'bg-clay/10 text-clay', badge: 'Inventory' }
  }
  return { Icon: Bell, tone: 'bg-sand text-ink/60', badge: 'Update' }
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
  const [reload, setReload] = useState(0)

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
  }, [page, reload])

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
      {isCustomer ? (
        <PageHeader
          eyebrow="Your account"
          title="Notifications"
          lede="Order updates, delivery news and the occasional nudge from the brands you shop with."
          actions={
            <>
              {localUnreadCount > 0 && (
                <Button tone="outline" size="sm" onClick={onMarkAllRead}>
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark all read
                </Button>
              )}
              <Button to="/nearby" tone="noir" size="sm">
                Keep shopping
              </Button>
            </>
          }
        />
      ) : (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line-warm pb-5">
          <div>
            <p className={eyebrow}>Account</p>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[30px]">
                Notifications
              </h1>
              {localUnreadCount > 0 && <Badge tone="clay">{localUnreadCount} unread</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {items.length > 0 && localUnreadCount > 0 && (
              <Button tone="outline" size="sm" onClick={onMarkAllRead}>
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </Button>
            )}
            <Link
              to={homePathFor(user?.role)}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink/55 transition hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </Link>
          </div>
        </div>
      )}

      {error && items.length > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-tile border border-clay/30 bg-clay/5 px-4 py-3 text-[13px] text-clay">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <Tabs
          label="Notification filter"
          value={filter}
          onChange={setFilter}
          className="mb-5 mt-8"
          items={[
            { value: 'all', label: 'All', count: items.length },
            { value: 'unread', label: 'Unread', count: localUnreadCount },
          ]}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${card} flex items-start gap-4 p-4`}>
              <Skeleton className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Could not load your notifications"
          message={error}
          onRetry={() => {
            setError('')
            setPagination(null)
            setReload((n) => n + 1)
          }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          message={
            isCustomer
              ? 'When you place orders or receive delivery updates, they will appear right here.'
              : 'Important store activity, inventory alerts, and updates will be listed here.'
          }
          action={
            isCustomer ? (
              <Button to="/nearby" tone="noir" size="sm">
                Explore marketplace
              </Button>
            ) : null
          }
        />
      ) : displayedItems.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="All caught up"
          message="You have no unread notifications right now."
          action={
            <Button tone="outline" size="sm" onClick={() => setFilter('all')}>
              View all notifications
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2.5">
            {displayedItems.map((n) => {
              const { Icon, tone, badge } = getNotificationVisuals(n.type)
              const to = targetFor(n, user)

              return (
                <div
                  key={n._id}
                  className={`group relative flex items-start gap-3.5 rounded-tile border p-4 transition-colors sm:gap-4 sm:p-5 ${
                    n.isRead
                      ? 'border-line-warm bg-paper-warm hover:border-ink/20'
                      : 'border-clay/30 bg-cream/60 hover:border-clay/50'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-tile ${tone}`}>
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-sand px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink/55">
                        {badge}
                      </span>
                      {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-label="Unread" />}
                    </div>

                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className="mt-1.5 block text-left font-display text-[16px] font-semibold tracking-tight text-ink transition hover:text-clay"
                    >
                      {n.title}
                    </button>

                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className="mt-1 block text-left text-[12.5px] leading-relaxed text-ink/55 transition hover:text-ink"
                    >
                      {n.message}
                    </button>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-ink/40">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDateTime(n.createdAt)}
                      </span>
                      {to && (
                        <button
                          type="button"
                          onClick={() => onItemClick(n)}
                          className="inline-flex items-center gap-1 font-semibold text-clay transition hover:underline"
                        >
                          View order details
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDelete(n)}
                    aria-label="Delete notification"
                    title="Delete notification"
                    className="rounded-full p-1.5 text-ink/30 transition hover:bg-clay/10 hover:text-clay"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line-warm pt-4">
              <Button tone="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Previous
              </Button>
              <span className="text-[11.5px] text-ink/45">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button tone="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )

  if (isCustomer) {
    return (
      <div className="bg-canvas">
        <div className={`${shell} max-w-[880px] pb-16 pt-10 sm:pt-14`}>{content}</div>
      </div>
    )
  }

  return <div>{content}</div>
}
