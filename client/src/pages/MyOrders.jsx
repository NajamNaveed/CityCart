import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useBrands } from '../hooks/useBrands'
import StatusPill from '../components/StatusPill'
import { EmptyState, Skeleton } from '../components/ui'
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
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Your account</p>
      <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">My orders</h1>

      <div className="mt-8">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : state.error ? (
          <p className="text-clay">{state.error}</p>
        ) : state.orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="You have not placed any orders yet."
            message="When you order from a brand, it shows up here with live status."
            className="py-20"
            action={
              <Link to="/shop" className={btnPrimary}>
                Start shopping
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {state.orders.map((o) => (
              <li key={o._id}>
                <Link
                  to={`/orders/${o._id}`}
                  className="group flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-ink">{o.orderNumber}</span>
                      <StatusPill value={o.orderStatus} />
                    </span>
                    <span className="mt-1 block text-[13px] text-muted">
                      {brandName[o.brandId] ? `${brandName[o.brandId]} · ` : ''}
                      {formatDateTime(o.createdAt)}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted/80">
                      {o.items.map((i) => `${i.productName} × ${i.quantity}`).join(', ')}
                    </span>
                  </span>
                  <span className="text-right font-semibold text-ink">{formatPrice(o.total)}</span>
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
            className="inline-flex items-center gap-1 font-medium text-clay transition hover:text-clay-dark disabled:text-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </button>
          <span className="text-muted">
            Page {pg.page} of {pg.pages}
          </span>
          <button
            type="button"
            disabled={pg.page >= pg.pages}
            onClick={() => setParams({ page: String(pg.page + 1) })}
            className="inline-flex items-center gap-1 font-medium text-clay transition hover:text-clay-dark disabled:text-muted"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
