import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { StatusBadge, PageHeader } from '../../components/brand/Bits'
import { formatDateTime, formatPrice } from '../../ui'

const total = (res) => (res.status === 'fulfilled' ? res.value.data.pagination.total : null)

export default function Overview() {
  const { user } = useAuth()
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    Promise.allSettled([
      api.get('/brand/orders', { params: { status: 'PENDING', limit: 1 } }),
      api.get('/products/mine', { params: { limit: 1 } }),
      api.get('/inventory', { params: { stockStatus: 'LOW_STOCK', limit: 1 } }),
      api.get('/inventory', { params: { stockStatus: 'OUT_OF_STOCK', limit: 1 } }),
      api.get('/brand/orders', { params: { limit: 5 } }),
    ]).then(([pending, products, low, out, recent]) => {
      if (!active) return
      setData({
        pending: total(pending),
        products: total(products),
        // Either call failing (e.g. no inventory permission) hides the card rather than showing a wrong number.
        attention: total(low) === null || total(out) === null ? null : total(low) + total(out),
        recent: recent.status === 'fulfilled' ? recent.value.data.orders : null,
      })
    })
    return () => {
      active = false
    }
  }, [])

  const cards = [
    ['Orders to confirm', data?.pending, '/brand/orders?status=PENDING'],
    ['Products', data?.products, '/brand/products'],
    ['Low or out of stock', data?.attention, '/brand/products'],
  ]

  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} intro="Here is what needs your attention." />

      <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
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
          <Link to="/brand/orders" className="text-[13px] font-medium text-pine hover:underline">
            All orders
          </Link>
        </div>
        {!data ? (
          <div className="h-28 animate-pulse bg-sand" />
        ) : !data.recent ? (
          <p className="text-sm text-muted">You do not have access to orders.</p>
        ) : data.recent.length === 0 ? (
          <p className="text-sm text-muted">No orders yet. They will appear here as customers place them.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent.map((o) => (
              <li key={o._id}>
                <Link to={`/brand/orders/${o._id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-sand/60">
                  <span>
                    <span className="block text-sm font-medium">{o.orderNumber}</span>
                    <span className="text-xs text-muted">{formatDateTime(o.createdAt)}</span>
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