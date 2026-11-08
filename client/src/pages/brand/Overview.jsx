import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Package,
  PackageX,
  Plus,
  RotateCcw,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import { useChat } from '../../hooks/useChat'
import {
  ErrorNotice,
  PageHeader,
  SectionTitle,
  StatCard,
  StatusBadge,
  tableHead,
  tableRow,
  TableScroll,
} from '../../components/brand/Bits'
import { Button } from '../../design'
import { Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice } from '../../ui'

const total = (res) => (res?.status === 'fulfilled' ? res.value.data.pagination.total : null)

export default function Overview() {
  const { user } = useAuth()
  const can = useCan()
  const { unread } = useChat()
  const owner = user?.role === 'BRAND_ADMIN'
  const canOrders = can('orders.view')
  const canProducts = can('products.view')
  const canStock = can('inventory.view')
  const canReturns = can('delivery.view')
  const canMessages = can('messages.view')

  const [reload, setReload] = useState(0)
  const [state, setState] = useState({ loaded: false, error: '', pending: null, products: null, attention: null, returns: null, recent: null })

  const load = useCallback(() => {
    let active = true
    const ask = (allowed, request) => (allowed ? Promise.allSettled([request()]).then(([result]) => result) : Promise.resolve(null))

    Promise.all([
      ask(canOrders, () => api.get('/brand/orders', { params: { status: 'PENDING', limit: 1 } })),
      ask(canProducts, () => api.get('/products/mine', { params: { limit: 1 } })),
      ask(canStock, () => api.get('/inventory', { params: { stockStatus: 'LOW_STOCK', limit: 1 } })),
      ask(canStock, () => api.get('/inventory', { params: { stockStatus: 'OUT_OF_STOCK', limit: 1 } })),
      ask(canReturns, () => api.get('/returns/summary')),
      ask(canOrders, () => api.get('/brand/orders', { params: { limit: 5 } })),
    ]).then(([pending, products, low, out, returns, recent]) => {
      if (!active) return
      const failed = [pending, products, low, out, returns, recent].find((result) => result?.status === 'rejected')
      setState({
        loaded: true,
        error: failed ? getErrorMessage(failed.reason) : '',
        pending: total(pending),
        products: total(products),
        attention: total(low) === null || total(out) === null ? null : total(low) + total(out),
        returns: returns?.status === 'fulfilled' ? returns.value.data.summary : null,
        recent: recent?.status === 'fulfilled' ? recent.value.data.orders : null,
      })
    })
    return () => {
      active = false
    }
  }, [canOrders, canProducts, canStock, canReturns])

  useEffect(() => load(), [load, reload])

  const wants = [
    canOrders && {
      icon: Clock3,
      label: 'Orders to confirm',
      value: state.pending,
      to: '/brand/orders?status=PENDING',
      tone: state.pending > 0 ? 'warn' : 'quiet',
      hint: state.pending > 0 ? 'Waiting for your answer' : 'Nothing waiting',
    },
    canReturns && {
      icon: RotateCcw,
      label: 'Returns on the way',
      value: state.returns?.IN_TRANSIT?.count ?? null,
      to: '/brand/returns?status=IN_TRANSIT',
      tone: 'quiet',
      hint: 'Riders bringing goods back',
    },
    canStock && {
      icon: PackageX,
      label: 'Low or out of stock',
      value: state.attention,
      to: owner ? '/brand/inventory' : '/brand/products',
      tone: state.attention > 0 ? 'bad' : 'quiet',
      hint: state.attention > 0 ? 'Restock before they sell out' : 'Stock looks healthy',
    },
    canProducts && {
      icon: ShoppingBag,
      label: 'Products listed',
      value: state.products,
      to: '/brand/products',
      tone: 'quiet',
      hint: 'Active and draft products',
    },
  ].filter(Boolean)

  const attention = [
    canOrders && state.pending > 0 && {
      key: 'orders',
      icon: Clock3,
      title: `${state.pending} order${state.pending === 1 ? '' : 's'} waiting for confirmation`,
      body: 'Confirm or reject before the customer gives up.',
      to: '/brand/orders?status=PENDING',
      action: 'Review orders',
    },
    canReturns && state.returns?.IN_TRANSIT?.count > 0 && {
      key: 'returns',
      icon: RotateCcw,
      title: `${state.returns.IN_TRANSIT.count} return${state.returns.IN_TRANSIT.count === 1 ? '' : 's'} on the way`,
      body: 'Riders are bringing goods back to the store.',
      to: '/brand/returns?status=IN_TRANSIT',
      action: 'Open returns',
    },
    canStock && state.attention > 0 && {
      key: 'stock',
      icon: PackageX,
      title: `${state.attention} product${state.attention === 1 ? '' : 's'} low or out of stock`,
      body: 'Restock so customers do not reach a dead end.',
      to: owner ? '/brand/inventory' : '/brand/products',
      action: 'Check stock',
    },
    canMessages && unread > 0 && {
      key: 'messages',
      icon: MessageCircle,
      title: `${unread} unread customer message${unread === 1 ? '' : 's'}`,
      body: 'Questions left unanswered are the easiest sales to lose.',
      to: '/brand/messages',
      action: 'Open messages',
    },
  ].filter(Boolean)

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title={`Welcome back, ${firstName}`}
        intro={owner ? user.brandName || 'Your brand at a glance.' : 'Your day across the brand, at a glance.'}
        action={
          can('products.create') ? (
            <Button to="/brand/products/new" tone="noir" size="sm">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add product
            </Button>
          ) : null
        }
      />

      {state.error && <div className="mb-6"><ErrorNotice onRetry={() => setReload((value) => value + 1)}>{state.error}</ErrorNotice></div>}

      {!state.loaded ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-card" />
          ))}
        </div>
      ) : wants.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {wants.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-line-warm bg-paper-warm p-6 text-[14px] leading-relaxed text-ink/60">
          You are signed in to the brand dashboard. Your access is set by the brand owner. If something you need is
          missing from the menu, ask them to update your access.
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <section aria-labelledby="attention-title">
          <SectionTitle
            title={<span id="attention-title">Needs attention</span>}
            hint={attention.length ? 'Small jobs that keep orders moving.' : 'Nothing is waiting on you right now.'}
          />
          {!state.loaded ? (
            <Skeleton className="h-40 w-full rounded-card" />
          ) : attention.length === 0 ? (
            <div className="flex items-start gap-3 rounded-card border border-forest/15 bg-sage/40 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden="true" />
              <div>
                <p className="text-[14px] font-semibold text-forest">You are all caught up.</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-forest/75">
                  New orders, returns and customer questions will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {attention.map((item) => (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    className="group flex items-start gap-3.5 rounded-card border border-line-warm bg-paper-warm p-4 transition hover:border-ink/20 hover:shadow-[0_14px_28px_rgba(21,20,15,0.06)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-cream text-clay">
                      <item.icon className="h-[17px] w-[17px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-ink/55">{item.body}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 self-center text-[11.5px] font-medium text-ink/45 group-hover:text-ink sm:flex">
                      {item.action}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="quick-actions-title">
          <SectionTitle title={<span id="quick-actions-title">Quick actions</span>} />
          <div className="grid gap-2.5">
            {can('products.create') && (
              <QuickAction to="/brand/products/new" icon={Plus} label="Add a product" hint="Photos, price and stock" />
            )}
            {canOrders && <QuickAction to="/brand/orders" icon={Package} label="Open orders" hint="Confirm and track deliveries" />}
            {canMessages && <QuickAction to="/brand/messages" icon={MessageCircle} label="Answer customers" hint={unread > 0 ? `${unread} unread` : 'Inbox is clear'} />}
            {owner && <QuickAction to="/brand/billing" icon={Wallet} label="Billing and invoices" hint="1% of completed sales" />}
          </div>
        </section>
      </div>

      {canOrders && (
        <section className="mt-9" aria-labelledby="latest-orders-title">
          <SectionTitle
            title={<span id="latest-orders-title">Latest orders</span>}
            action={
              <Link to="/brand/orders" className="inline-flex items-center gap-1 text-[12px] font-medium text-clay underline-offset-4 hover:underline">
                All orders
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          {!state.loaded ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-card" />
              ))}
            </div>
          ) : state.recent === null ? (
            <ErrorNotice onRetry={() => setReload((value) => value + 1)}>Orders could not be loaded.</ErrorNotice>
          ) : state.recent.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-warm bg-paper-warm p-8 text-center text-[13px] text-ink/55">
              No orders yet. They will appear here as customers place them.
            </p>
          ) : (
            <>
              <TableScroll label="Latest orders" className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className={tableHead}>
                      <th className="px-5 py-3 font-medium">Order</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Payment</th>
                      <th className="px-5 py-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.recent.map((order) => (
                      <tr key={order._id} className={tableRow}>
                        <td className="px-5 py-3.5">
                          <Link to={`/brand/orders/${order._id}`} className="font-medium text-ink transition hover:text-clay">
                            {order.orderNumber}
                          </Link>
                          <span className="block text-[11.5px] text-ink/50">{formatDateTime(order.createdAt)}</span>
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge value={order.orderStatus} /></td>
                        <td className="px-4 py-3.5"><StatusBadge value={order.paymentStatus} /></td>
                        <td className="px-5 py-3.5 text-right font-semibold text-ink">{formatPrice(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              <ul className="space-y-2 md:hidden">
                {state.recent.map((order) => (
                  <li key={order._id}>
                    <Link to={`/brand/orders/${order._id}`} className="block rounded-card border border-line-warm bg-paper-warm p-4 transition hover:border-ink/20">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13.5px] font-medium text-ink">{order.orderNumber}</p>
                          <p className="mt-0.5 text-[11.5px] text-ink/50">{formatDateTime(order.createdAt)}</p>
                        </div>
                        <p className="text-[13.5px] font-semibold text-ink">{formatPrice(order.total)}</p>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <StatusBadge value={order.orderStatus} />
                        <StatusBadge value={order.paymentStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  )
}

function QuickAction({ to, icon: Icon, label, hint }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-card border border-line-warm bg-paper-warm px-4 py-3.5 transition hover:border-ink/20 hover:bg-cream/40"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-tile bg-sand text-ink/55 group-hover:text-clay">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11.5px] text-ink/50">{hint}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-ink/25 transition group-hover:translate-x-0.5 group-hover:text-ink/50" aria-hidden="true" />
    </Link>
  )
}
