import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PackageSearch, Search } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatDateTime, formatPrice, humanize } from '../../ui'

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

      <div className="mb-5 flex flex-wrap gap-2.5">
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-56"
          onSubmit={(e) => {
            e.preventDefault()
            update({ search: new FormData(e.currentTarget).get('q').toString().trim() })
          }}
        >
          <label htmlFor="q" className="sr-only">
            Search by order number
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/55" aria-hidden="true" />
          <input
            key={search}
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Order number, e.g. CC-2026"
            className="h-10 w-full rounded-tile border border-line-warm bg-paper-warm pl-9 pr-3 text-[13px] text-ink outline-none transition focus:border-ink"
          />
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
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.orders.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No orders match." className="rounded-card border border-dashed border-line-warm bg-paper-warm" />
      ) : (
        <>
          <TableScroll label="Orders" className="hidden md:block">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="py-3 pr-4 font-medium">Brand</th>
                  <th className="py-3 pr-4 font-medium">Customer</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Payment</th>
                  <th className="py-3 pr-5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {state.orders.map((o) => (
                  <tr key={o._id} className={tableRow}>
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/orders/${o._id}`} className="font-medium text-ink transition hover:text-clay">
                        {o.orderNumber}
                      </Link>
                      <span className="block text-xs text-ink/55">{formatDateTime(o.createdAt)}</span>
                    </td>
                    <td className="py-3.5 pr-4 text-ink">{o.brandName || '—'}</td>
                    <td className="py-3.5 pr-4 text-ink">{o.shippingAddress?.name}</td>
                    <td className="py-3.5 pr-4">
                      <StatusBadge value={o.orderStatus} />
                    </td>
                    <td className="py-3.5 pr-4">
                      <StatusBadge value={o.paymentStatus} />
                    </td>
                    <td className="py-3.5 pr-5 text-right font-semibold text-ink">{formatPrice(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="space-y-3 md:hidden">
            {state.orders.map((o) => (
              <li key={o._id} className="rounded-card border border-line-warm bg-paper-warm p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link to={`/admin/orders/${o._id}`} className="font-medium text-ink transition hover:text-clay">
                    {o.orderNumber}
                  </Link>
                  <span className="font-semibold text-ink">{formatPrice(o.total)}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-ink/55">
                  {o.brandName || 'Unknown brand'} · {o.shippingAddress?.name || 'No customer name'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge value={o.orderStatus} />
                  <StatusBadge value={o.paymentStatus} />
                  <span className="text-xs text-ink/45">{formatDateTime(o.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}