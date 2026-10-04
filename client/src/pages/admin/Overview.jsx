import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { PageHeader, StatusBadge } from '../../components/brand/Bits'
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
    ['Brands', data?.brands, '/admin/brands'],
    ['Active brands', data?.activeBrands, '/admin/brands?status=ACTIVE'],
    ['Orders', data?.orders, '/admin/orders'],
    ['Awaiting confirmation', data?.pending, '/admin/orders?status=PENDING'],
  ]

  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} intro="The platform at a glance." />

      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, to]) => (
          <Link key={label} to={to} className="bg-cream p-6 transition hover:bg-sand">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{label}</p>
            <p className="mt-3 text-4xl font-semibold">{!data ? '…' : value ?? '—'}</p>
          </Link>
        ))}
      </div>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between border-b border-line pb-3">
          <h2 className="text-lg font-semibold">Latest orders</h2>
          <Link to="/admin/orders" className="text-[13px] font-medium text-clay hover:underline">
            All orders
          </Link>
        </div>
        {!data ? (
          <div className="h-28 animate-pulse bg-sand" />
        ) : !data.recent ? (
          <p className="text-sm text-muted">Orders could not be loaded.</p>
        ) : data.recent.length === 0 ? (
          <p className="text-sm text-muted">No orders have been placed yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent.map((o) => (
              <li key={o._id}>
                <Link to={`/admin/orders/${o._id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-sand/60">
                  <span>
                    <span className="block text-sm font-medium">{o.orderNumber}</span>
                    <span className="text-xs text-muted">
                      {o.brandName || 'Unknown brand'} · {formatDateTime(o.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <StatusBadge value={o.orderStatus} />
                    <span className="w-24 text-right text-sm font-semibold">{formatPrice(o.total)}</span>
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