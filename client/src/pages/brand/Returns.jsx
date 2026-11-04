import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { PageHeader, Pager, StatusBadge, selectClass, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatDate, formatPrice, humanize } from '../../ui'
import { isReturnOpen, returnUnits } from '../../utils/returns'

const STATUSES = ['IN_TRANSIT', 'RECEIVED']

function Totals({ summary }) {
  if (!summary) return null
  const cards = [
    ['On their way', summary.IN_TRANSIT?.count || 0, 'Returns not yet taken in'],
    ['Goods returned', formatPrice(summary.returnedSubtotal), 'All time, at selling price'],
    ['Refunded', formatPrice(summary.refundAmount), 'Prepaid orders only'],
  ]
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      {cards.map(([label, value, hint]) => (
        <div key={label} className="rounded-lg border border-line bg-white px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{value}</p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
      ))}
    </div>
  )
}

export default function Returns() {
  const [params, setParams] = useSearchParams()
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [summary, setSummary] = useState(null)
  const [state, setState] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([status, page])

  useEffect(() => {
    let active = true
    api
      .get('/returns/summary')
      .then((res) => active && setSummary(res.data.summary))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api
      .get('/returns', { params: { limit: 15, page, ...(status && { status }) } })
      .then((res) => active && setState({ key, items: res.data.returns, pagination: res.data.pagination, error: '' }))
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
        title="Returned goods"
        intro="What riders are bringing back from the door, and what the store has taken in."
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

      <Totals summary={summary} />

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title={status ? 'No returns with that status.' : 'No returns yet.'}
          message={!status ? 'Goods a customer refuses at the door appear here.' : undefined}
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <div className={tableShell}>
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead>
              <tr className={tableHead}>
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="py-3 pr-4 font-medium">Goods</th>
                <th className="py-3 pr-4 font-medium">Value</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-5 font-medium">Arrived</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((ret) => (
                <tr key={ret._id} className={tableRow}>
                  <td className="px-5 py-3.5">
                    <Link to={`/brand/returns/${ret._id}`} className="font-medium text-ink transition hover:text-pine">
                      {ret.orderNumber || 'View return'}
                    </Link>
                  </td>
                  <td className="py-3.5 pr-4 text-ink">
                    {returnUnits(ret)} {returnUnits(ret) === 1 ? 'item' : 'items'}
                    {ret.feeRefunded ? <span className="block text-xs text-muted">Delivery fee refunded</span> : null}
                  </td>
                  <td className="py-3.5 pr-4 text-ink">
                    {formatPrice(ret.returnedSubtotal)}
                    {ret.refundAmount > 0 ? <span className="block text-xs text-muted">Refunded {formatPrice(ret.refundAmount)}</span> : null}
                  </td>
                  <td className="py-3.5 pr-4">
                    <StatusBadge value={ret.status} />
                  </td>
                  <td className="py-3.5 pr-5 text-muted">{ret.receivedAt ? formatDate(ret.receivedAt) : isReturnOpen(ret.status) ? 'On the way' : '—'}</td>
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
