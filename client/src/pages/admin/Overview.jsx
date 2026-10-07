import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, Package, Store, Store as StoreIcon } from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader, StatusBadge } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice } from '../../ui'

const total = (res) => (res.status === 'fulfilled' ? res.value.data.pagination.total : null)

export default function Overview() {
  const { user } = useAuth()
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    Promise.allSettled([
      api.get('/admin/brands', { params: { limit: 1 } }),
      api.get('/admin/brands', { params: { status: 'ACTIVE', limit: 1 } }),
      api.get('/admin/orders', { params: { limit: 1 } }),
      api.get('/admin/orders', { params: { status: 'PENDING', limit: 1 } }),
      api.get('/admin/orders', { params: { limit: 5 } }),
    ]).then(([brands, active_, orders, pending, recent]) => {
      if (!active) return
      setData({
        brands: total(brands),
        activeBrands: total(active_),
        orders: total(orders),
        pending: total(pending),
        recent: recent.status === 'fulfilled' ? recent.value.data.orders : null,
      })
    })
    return () => {
      active = false
    }
  }, [])

  const cards = [
    { icon: Store, label: 'Brands', value: data?.brands, to: '/admin/brands', accent: 'text-info' },
    { icon: StoreIcon, label: 'Active brands', value: data?.activeBrands, to: '/admin/brands?status=ACTIVE', accent: 'text-success' },
    { icon: Package, label: 'Orders', value: data?.orders, to: '/admin/orders', accent: 'text-ink/70' },
    { icon: Clock3, label: 'Awaiting confirmation', value: data?.pending, to: '/admin/orders?status=PENDING', accent: data?.pending > 0 ? 'text-warning' : 'text-muted' },
  ]

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} intro="The platform at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ icon: Icon, label, value, to, accent }) => (
          <Link
            key={label}
            to={to}
            className="group rounded-lg border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lg hover:shadow-ink/5"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-paper">
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

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[15px] font-semibold text-ink">Latest orders</h2>
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-clay transition hover:text-clay-dark"
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
            No orders have been placed yet.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {data.recent.map((o) => (
              <li key={o._id}>
                <Link
                  to={`/admin/orders/${o._id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-paper/60"
                >
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">{o.orderNumber}</span>
                    <span className="text-xs text-muted">
                      {o.brandName || 'Unknown brand'} · {formatDateTime(o.createdAt)}
                    </span>
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
    </>
  )
}
