import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
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
        <div className="h-48 animate-pulse bg-sand" />
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.orders.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">{status ? 'No orders with that status.' : 'No orders yet.'}</p>
          {!status && <p className="mt-1 text-sm text-muted">They will appear here as customers place them.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                <th className="py-3 pr-4 font-medium">Order</th>
                <th className="py-3 pr-4 font-medium">Customer</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Payment</th>
                <th className="py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.orders.map((o) => (
                <tr key={o._id} className="hover:bg-sand/60">
                  <td className="py-3 pr-4">
                    <Link to={`/brand/orders/${o._id}`} className="font-medium text-pine hover:underline">
                      {o.orderNumber}
                    </Link>
                    <span className="block text-xs text-muted">{formatDateTime(o.createdAt)}</span>
                  </td>
                  <td className="py-3 pr-4">{o.shippingAddress?.name}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge value={o.orderStatus} />
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge value={o.paymentStatus} />
                  </td>
                  <td className="py-3 text-right font-semibold">{formatPrice(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}