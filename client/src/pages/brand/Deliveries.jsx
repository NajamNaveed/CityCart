import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { humanize } from '../../ui'

const STATUSES = ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED']

export default function Deliveries() {
  const [params, setParams] = useSearchParams()
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([status, page])

  useEffect(() => {
    let active = true
    api
      .get('/deliveries', { params: { limit: 15, page, ...(status && { status }) } })
      .then((res) => active && setState({ key, items: res.data.deliveries, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, items: [], pagination: null, error: getErrorMessage(err) }))
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
        title="Deliveries"
        intro="Orders that are ready to go out or on their way."
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
      ) : state.items.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">{status ? 'No deliveries with that status.' : 'No deliveries yet.'}</p>
          {!status && <p className="mt-1 text-sm text-muted">A delivery appears here when you mark an order ready for shipment.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                <th className="py-3 pr-4 font-medium">Order</th>
                <th className="py-3 pr-4 font-medium">Deliver to</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 font-medium">Tracking / agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.items.map((d) => (
                <tr key={d._id} className="hover:bg-sand/60">
                  <td className="py-3 pr-4">
                    <Link to={`/brand/orders/${d.orderId}`} className="font-medium text-pine hover:underline">
                      {d.orderNumber || 'View order'}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    {d.address?.name}
                    <span className="block text-xs text-muted">{[d.address?.address, d.address?.city].filter(Boolean).join(', ')}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge value={d.status} />
                  </td>
                  <td className="py-3 text-muted">{[d.trackingReference, d.assignedAgent].filter(Boolean).join(' · ') || '—'}</td>
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