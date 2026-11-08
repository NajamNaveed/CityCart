import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PackageSearch } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice, humanize } from '../../ui'

const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED']

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, orders: [], pagination: null, error: '' })
  const key = JSON.stringify([status, page])

  useEffect(() => {
    let active = true
    api
      .get('/brand/orders', { params: { limit: 15, page, ...(status && { status }) } })
      .then((res) => active && setState({ key, orders: res.data.orders, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, orders: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [status, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  const loading = state.key !== key

  return (
    <>
      <PageHeader
        title="Orders"
        intro="Orders placed with your brand."
        action={
          <>
            <label htmlFor="status" className="sr-only">
              Status
            </label>
            <select id="status" value={status} onChange={(e) => update({ status: e.target.value })} className={selectClass}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </>
        }
      />

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.orders.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={status ? 'No orders with that status.' : 'No orders yet.'}
          message={!status ? 'They will appear here as customers place them.' : undefined}
          className="rounded-card border border-dashed border-line-warm bg-paper-warm"
        />
      ) : (
        <>
          <TableScroll label="Orders" className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {state.orders.map((o) => (
                  <tr key={o._id} className={tableRow}>
                    <td className="px-5 py-3.5">
                      <Link to={`/brand/orders/${o._id}`} className="font-medium text-ink transition hover:text-clay">
                        {o.orderNumber}
                      </Link>
                      <span className="block text-[11.5px] text-ink/50">{formatDateTime(o.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-ink">{o.shippingAddress?.name}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge value={o.orderStatus} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge value={o.paymentStatus} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-ink">{formatPrice(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="space-y-2.5 md:hidden">
            {state.orders.map((o) => (
              <li key={o._id}>
                <Link to={`/brand/orders/${o._id}`} className="block rounded-card border border-line-warm bg-paper-warm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-ink">{o.orderNumber}</p>
                      <p className="mt-0.5 truncate text-[12px] text-ink/55">
                        {o.shippingAddress?.name} · {formatDateTime(o.createdAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-[13.5px] font-semibold text-ink">{formatPrice(o.total)}</p>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <StatusBadge value={o.orderStatus} />
                    <StatusBadge value={o.paymentStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}