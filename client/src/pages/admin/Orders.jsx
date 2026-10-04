import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { formatDateTime, formatPrice, humanize, inputClass } from '../../ui'

const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED']

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const brandId = params.get('brandId') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [brands, setBrands] = useState([])
  const [state, setState] = useState({ key: null, orders: [], pagination: null, error: '' })
  const key = JSON.stringify([search, status, brandId, page])

  useEffect(() => {
    let active = true
    api
      .get('/admin/brands', { params: { limit: 50 } })
      .then((res) => active && setBrands(res.data.brands))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api
      .get('/admin/orders', { params: { limit: 20, page, ...(search && { search }), ...(status && { status }), ...(brandId && { brandId }) } })
      .then((res) => active && setState({ key, orders: res.data.orders, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, orders: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [search, status, brandId, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  const loading = state.key !== key

  return (
    <>
      <PageHeader title="Orders" intro="Every order placed on the platform." />

      <div className="mb-6 flex flex-wrap gap-3">
        <form
          role="search"
          className="flex flex-1 basis-56 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            update({ search: new FormData(e.currentTarget).get('q').toString().trim() })
          }}
        >
          <label htmlFor="q" className="sr-only">
            Search by order number
          </label>
          <input key={search} id="q" name="q" defaultValue={search} placeholder="Order number, e.g. CC-2026" className={`h-10 min-w-0 flex-1 ${inputClass}`} />
          <button type="submit" className="h-10 rounded-sm bg-ink px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-cream hover:bg-black">
            Search
          </button>
        </form>
        <label htmlFor="brand" className="sr-only">
          Brand
        </label>
        <select id="brand" value={brandId} onChange={(e) => update({ brandId: e.target.value })} className={selectClass}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </select>
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
      </div>

      {loading ? (
        <div className="h-48 animate-pulse bg-sand" />
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.orders.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">No orders match.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                <th className="py-3 pr-4 font-medium">Order</th>
                <th className="py-3 pr-4 font-medium">Brand</th>
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
                    <Link to={`/admin/orders/${o._id}`} className="font-medium text-clay hover:underline">
                      {o.orderNumber}
                    </Link>
                    <span className="block text-xs text-muted">{formatDateTime(o.createdAt)}</span>
                  </td>
                  <td className="py-3 pr-4">{o.brandName || '—'}</td>
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