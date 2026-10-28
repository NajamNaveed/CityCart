import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { EmptyState, Skeleton } from '../../components/ui'
import { PageHeader, Pager, selectClass, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { formatDateTime } from '../../ui'

const ACTION_LABELS = {
  'admin.partner.create': 'Partner added',
  'admin.partner.update': 'Partner access updated',
  'admin.partner.activate': 'Partner reactivated',
  'admin.partner.deactivate': 'Partner deactivated',
  'admin.partner.reset_password': 'Partner password reset',
  'brand.create': 'Brand added',
  'brand.update': 'Brand updated',
  'brand.status': 'Brand status changed',
  'brand.terminate': 'Brand terminated',
  'city.create': 'City added',
  'city.update': 'City updated',
  'city.deactivate': 'City deactivated',
  'block.create': 'Area added',
  'block.update': 'Area updated',
  'block.deactivate': 'Area deactivated',
  'review.moderate': 'Review moderated',
  'settings.update': 'Platform settings updated',
  'payment.status': 'Payment status changed',
}

const actionLabel = (action) => ACTION_LABELS[action] || action

export default function AdminActivity() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [state, setState] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([page, action])

  useEffect(() => {
    let current = true
    api
      .get('/admin/activity', { params: { page, limit: 30, action: action || undefined } })
      .then(({ data }) => current && setState({ key, items: data.items, pagination: data.pagination, error: '' }))
      .catch((err) => current && setState({ key, items: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      current = false
    }
  }, [key, page, action])

  const loading = state.key !== key

  return (
    <>
      <PageHeader
        title="Activity"
        intro="Every platform change made by you or an admin partner, newest first."
        action={
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            Action
            <select
              value={action}
              onChange={(e) => {
                setPage(1)
                setAction(e.target.value)
              }}
              className={selectClass}
              aria-label="Filter by action"
            >
              <option value="">All actions</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={History}
          title={action ? 'No activity of this kind.' : 'No platform changes yet.'}
          message="Actions taken by the super admin and partners will appear here."
          className="rounded-lg border border-dashed border-line bg-white"
        />
      ) : (
        <>
          <div className={tableShell}>
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="py-3 pr-4 font-medium">Who</th>
                  <th className="py-3 pr-4 font-medium">Action</th>
                  <th className="py-3 pr-5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item._id} className={tableRow}>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[12.5px] text-muted">{formatDateTime(item.createdAt)}</td>
                    <td className="py-3.5 pr-4">
                      <span className="block font-medium text-ink">{item.actor?.name || 'Unknown'}</span>
                      <span className="text-[12px] text-muted">{item.actor?.email}</span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="block text-ink">{actionLabel(item.action)}</span>
                      <span className="text-[12px] text-muted">{item.action}</span>
                    </td>
                    <td className="py-3.5 pr-5 text-[12.5px] text-muted">
                      {item.target?.label && <span className="block text-ink">{item.target.label}</span>}
                      {item.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager pagination={state.pagination} onPage={setPage} />
        </>
      )}
    </>
  )
}
