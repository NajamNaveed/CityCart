import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import api, { getErrorMessage } from '../services/api'
import { useBrands } from '../hooks/useBrands'
import StatusPill from '../components/StatusPill'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, btn, card, cardLift, shell } from '../design'
import { formatDateTime, formatPrice } from '../ui'

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
    <div className="bg-canvas">
      <div className={`${shell} max-w-4xl pb-16 pt-10 sm:pt-14`}>
        <PageHeader
          eyebrow="Your account"
          title="My orders"
          lede="Every order you place, with its live status and the final amount."
        />

        <div className="mt-8">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-card" />
              ))}
            </div>
          ) : state.error ? (
            <ErrorState title="We couldn't load your orders" message={state.error} />
          ) : state.orders.length === 0 ? (
            <EmptyState
              icon={Package}
              title="You have not placed any orders yet."
              message="When you order from a store, it shows up here with live status."
              action={
                <Button to="/nearby" tone="noir" size="md">
                  Browse stores
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {state.orders.map((o) => (
                <li key={o._id}>
                  <Link
                    to={`/orders/${o._id}`}
                    className={`group flex flex-wrap items-center gap-x-5 gap-y-3 ${card} p-5 ${cardLift}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-ink">{o.orderNumber}</span>
                        <StatusPill value={o.orderStatus} />
                      </span>
                      <span className="mt-1 block text-[12.5px] text-ink/60">
                        {brandName[o.brandId] ? `${brandName[o.brandId]} · ` : ''}
                        {formatDateTime(o.createdAt)}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink/55">
                        {o.items.map((i) => `${i.productName} × ${i.quantity}`).join(', ')}
                      </span>
                    </span>
                    <span className="text-right font-semibold text-ink">{formatPrice(o.netTotal ?? o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pg && pg.pages > 1 && (
          <div className="mt-8 flex items-center justify-between gap-3 text-[12.5px]">
            <button
              type="button"
              disabled={pg.page <= 1}
              onClick={() => setParams(pg.page - 1 > 1 ? { page: String(pg.page - 1) } : {})}
              className={btn('outline', 'sm')}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </button>
            <span className="text-ink/50">
              Page {pg.page} of {pg.pages}
            </span>
            <button
              type="button"
              disabled={pg.page >= pg.pages}
              onClick={() => setParams({ page: String(pg.page + 1) })}
              className={btn('outline', 'sm')}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
