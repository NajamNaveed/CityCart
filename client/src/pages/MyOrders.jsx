import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../services/api'
import { useBrands } from '../hooks/useBrands'
import StatusPill from '../components/StatusPill'
import { btnPrimary, formatDateTime, formatPrice, wrap } from '../ui'

export default function MyOrders() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { brands } = useBrands('')
  const brandName = Object.fromEntries(brands.map((b) => [b._id, b.name]))

  const [state, setState] = useState({ page: null, orders: [], pagination: null, error: '' })

  useEffect(() => {
    let active = true
    api
      .get('/orders/my', { params: { limit: 10, page } })
      .then((res) => active && setState({ page, orders: res.data.orders, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ page, orders: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [page])

  const loading = state.page !== page
  const pg = state.pagination

  return (
    <div className={`${wrap} max-w-4xl py-10`}>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My orders</h1>

      <div className="mt-8">
        {loading ? (
          <div className="h-48 animate-pulse bg-sand" />
        ) : state.error ? (
          <p className="text-clay">{state.error}</p>
        ) : state.orders.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium">You have not placed any orders yet.</p>
            <Link to="/shop" className={`${btnPrimary} mt-6`}>
              Start shopping
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {state.orders.map((o) => (
              <li key={o._id}>
                <Link to={`/orders/${o._id}`} className="flex flex-wrap items-center justify-between gap-4 py-5 transition hover:bg-sand/60">
                  <span>
                    <span className="block font-medium">{o.orderNumber}</span>
                    <span className="block text-sm text-muted">
                      {brandName[o.brandId] ? `${brandName[o.brandId]} · ` : ''}
                      {formatDateTime(o.createdAt)}
                    </span>
                    <span className="block text-sm text-muted">
                      {o.items.map((i) => `${i.productName} × ${i.quantity}`).join(', ')}
                    </span>
                  </span>
                  <span className="flex items-center gap-5">
                    <StatusPill value={o.orderStatus} />
                    <span className="w-24 text-right font-semibold">{formatPrice(o.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pg && pg.pages > 1 && (
        <div className="mt-8 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pg.page <= 1}
            onClick={() => setParams(pg.page - 1 > 1 ? { page: String(pg.page - 1) } : {})}
            className="font-medium text-clay disabled:text-muted"
          >
            Previous
          </button>
          <span className="text-muted">
            Page {pg.page} of {pg.pages}
          </span>
          <button
            type="button"
            disabled={pg.page >= pg.pages}
            onClick={() => setParams({ page: String(pg.page + 1) })}
            className="font-medium text-clay disabled:text-muted"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}