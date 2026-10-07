import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, PackageX, ShoppingBag } from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import { StatusBadge, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice } from '../../ui'

const total = (res) => (res?.status === 'fulfilled' ? res.value.data.pagination.total : null)
const skip = Promise.resolve(null)

export default function Overview() {
  const { user } = useAuth()
  const can = useCan()
  const canOrders = can('orders.view')
  const canProducts = can('products.view')
  const canStock = can('inventory.view')
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    // Only ask for what this person may see, so a team member never triggers a refusal.
    const ask = (allowed, request) => (allowed ? Promise.allSettled([request()]).then(([r]) => r) : skip)
    Promise.all([
      ask(canOrders, () => api.get('/brand/orders', { params: { status: 'PENDING', limit: 1 } })),
      ask(canProducts, () => api.get('/products/mine', { params: { limit: 1 } })),
      ask(canStock, () => api.get('/inventory', { params: { stockStatus: 'LOW_STOCK', limit: 1 } })),
      ask(canStock, () => api.get('/inventory', { params: { stockStatus: 'OUT_OF_STOCK', limit: 1 } })),
      ask(canOrders, () => api.get('/brand/orders', { params: { limit: 5 } })),
    ]).then(([pending, products, low, out, recent]) => {
      if (!active) return
      setData({
        pending: total(pending),
        products: total(products),
        attention: total(low) === null || total(out) === null ? null : total(low) + total(out),
        recent: recent?.status === 'fulfilled' ? recent.value.data.orders : null,
      })
    })
    return () => {
      active = false
    }
  }, [canOrders, canProducts, canStock])

  const cards = [
    canOrders && {
      icon: Clock3,
      label: 'Orders to confirm',
      value: data?.pending,
      to: '/brand/orders?status=PENDING',
      accent: data?.pending > 0 ? 'text-warning' : 'text-muted',
    },
    canProducts && { icon: ShoppingBag, label: 'Products', value: data?.products, to: '/brand/products', accent: 'text-info' },
    canStock && {
      icon: PackageX,
      label: 'Low or out of stock',
      value: data?.attention,
      to: canProducts ? '/brand/products' : '/brand',
      accent: data?.attention > 0 ? 'text-danger' : 'text-muted',
    },
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        intro={cards.length ? 'Here is what needs your attention.' : undefined}
      />

      {cards.length === 0 && (
        <p className="max-w-xl rounded-lg border border-line bg-white p-6 text-[14.5px] leading-relaxed text-muted">
          You are signed in to the brand dashboard. Your access is set by the brand owner. If something you need is
          missing from the menu, ask them to update your access.
        </p>
      )}

      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ icon: Icon, label, value, to, accent }) => (
            <Link
              key={label}
              to={to}
              className="group rounded-lg border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lg hover:shadow-ink/5"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper text-ink/70">
                  <Icon className={`h-5 w-5 ${accent}`} aria-hidden="true" />
                </span>
                <ArrowRight
                  className="h-4 w-4 text-muted/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-ink"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
              <p className="font-display mt-1.5 text-4xl font-semibold text-ink">{!data ? '…' : value ?? '—'}</p>
            </Link>
          ))}
        </div>
      )}

      {canOrders && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Latest orders</h2>
            <Link
              to="/brand/orders"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-pine transition hover:text-ink"
            >
              All orders
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {!data ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !data.recent ? (
            <p className="rounded-lg border border-line bg-white p-5 text-sm text-muted">Orders could not be loaded.</p>
          ) : data.recent.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
              No orders yet. They will appear here as customers place them.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-white">
              {data.recent.map((o) => (
                <li key={o._id}>
                  <Link
                    to={`/brand/orders/${o._id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-paper/60"
                  >
                    <span>
                      <span className="block text-[13.5px] font-medium text-ink">{o.orderNumber}</span>
                      <span className="text-xs text-muted">{formatDateTime(o.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-4">
                      <StatusBadge value={o.orderStatus} />
                      <span className="w-24 text-right text-sm font-semibold text-ink">{formatPrice(o.total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
