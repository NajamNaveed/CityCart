import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Truck } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
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
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={status ? 'No deliveries with that status.' : 'No deliveries yet.'}
          message={!status ? 'A delivery appears here when you mark an order ready for shipment.' : undefined}
          className="rounded-card border border-dashed border-line-warm bg-paper-warm"
        />
      ) : (
        <>
          <TableScroll label="Deliveries" className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Deliver to</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Tracking or rider</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((d) => (
                  <tr key={d._id} className={tableRow}>
                    <td className="px-5 py-3.5">
                      <Link to={`/brand/orders/${d.orderId}`} className="font-medium text-ink transition hover:text-clay">
                        {d.orderNumber || 'View order'}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-ink">
                      {d.address?.name}
                      <span className="block text-[11.5px] text-ink/50">{[d.address?.address, d.address?.city].filter(Boolean).join(', ')}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge value={d.status} />
                    </td>
                    <td className="px-5 py-3.5 text-ink/55">{[d.trackingReference, d.assignedAgent].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="space-y-2.5 md:hidden">
            {state.items.map((d) => (
              <li key={d._id} className="rounded-card border border-line-warm bg-paper-warm p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/brand/orders/${d.orderId}`} className="text-[13.5px] font-medium text-ink">
                    {d.orderNumber || 'View order'}
                  </Link>
                  <StatusBadge value={d.status} />
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink/60">
                  {d.address?.name}
                  <span className="block text-[11.5px] text-ink/45">{[d.address?.address, d.address?.city].filter(Boolean).join(', ')}</span>
                </p>
                <p className="mt-2 text-[11.5px] text-ink/45">
                  {[d.trackingReference, d.assignedAgent].filter(Boolean).join(' · ') || 'No tracking details yet'}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pager pagination={state.pagination} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}