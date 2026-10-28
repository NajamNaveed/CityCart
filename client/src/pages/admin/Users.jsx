import { useEffect, useState } from 'react'
import { Search, UsersRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { EmptyState, Skeleton } from '../../components/ui'
import { PageHeader, Pager, StatusBadge, selectClass, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { formatDateTime, humanize } from '../../ui'

const ROLES = ['CUSTOMER', 'BRAND_ADMIN', 'BRAND_EMPLOYEE', 'ADMIN_PARTNER', 'SUPER_ADMIN']

export default function Users() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const role = ROLES.includes(params.get('role')) ? params.get('role') : ''
  const active = ['true', 'false'].includes(params.get('isActive')) ? params.get('isActive') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const key = JSON.stringify([search, role, active, page])
  const [state, setState] = useState({ key: null, users: [], pagination: null, error: '' })

  useEffect(() => {
    let current = true
    api.get('/admin/users', { params: { search: search || undefined, role: role || undefined, isActive: active || undefined, page, limit: 20 } })
      .then(({ data }) => current && setState({ key, users: data.users, pagination: data.pagination, error: '' }))
      .catch((err) => current && setState({ key, users: [], pagination: null, error: getErrorMessage(err) }))
    return () => { current = false }
  }, [search, role, active, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([name, value]) => (value ? next.set(name, value) : next.delete(name)))
    setParams(next)
  }

  const loading = state.key !== key
  return (
    <>
      <PageHeader title="User directory" intro="Customers and brand staff registered on CityCart." />
      <div className="mb-5 flex flex-wrap gap-2.5">
        <form role="search" className="relative min-w-0 flex-1 basis-56" onSubmit={(event) => {
          event.preventDefault()
          update({ search: new FormData(event.currentTarget).get('search').toString().trim() })
        }}>
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input key={search} id="user-search" name="search" defaultValue={search} placeholder="Name or email" className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-[13px] text-ink outline-none focus:border-ink" />
        </form>
        <label htmlFor="user-role" className="sr-only">Filter by role</label>
        <select id="user-role" value={role} onChange={(event) => update({ role: event.target.value })} className={selectClass}>
          <option value="">All roles</option>
          {ROLES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
        </select>
        <label htmlFor="user-status" className="sr-only">Filter by account status</label>
        <select id="user-status" value={active} onChange={(event) => update({ isActive: event.target.value })} className={selectClass}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2.5">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-16 w-full rounded-lg" />)}</div>
      ) : state.error ? (
        <p role="alert" className="text-clay">{state.error}</p>
      ) : state.users.length === 0 ? (
        <EmptyState icon={UsersRound} title="No users match." message="Try another name, email, role, or status." className="rounded-lg border border-dashed border-line bg-white" />
      ) : (
        <div className={tableShell}>
          <table className="w-full min-w-[55rem] text-left text-sm">
            <thead><tr className={tableHead}>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="py-3 pr-4 font-medium">Role</th>
              <th className="py-3 pr-4 font-medium">Brand</th>
              <th className="py-3 pr-4 text-right font-medium">Orders</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-5 font-medium">Registered</th>
            </tr></thead>
            <tbody>{state.users.map((user) => (
              <tr key={user._id} className={tableRow}>
                <td className="px-5 py-3.5">
                  <span className="block font-medium text-ink">{user.name}</span>
                  <span className="text-xs text-muted">{user.email}</span>
                  {user.phone && <span className="block text-xs text-muted">{user.phone}</span>}
                </td>
                <td className="py-3.5 pr-4 text-ink">{humanize(user.role)}</td>
                <td className="py-3.5 pr-4 text-muted">{user.brandName || '—'}{user.jobTitle && <span className="block text-xs">{user.jobTitle}</span>}</td>
                <td className="py-3.5 pr-4 text-right tabular-nums text-ink">{user.orderCount}</td>
                <td className="py-3.5 pr-4"><StatusBadge value={user.isActive ? 'ACTIVE' : 'INACTIVE'} /></td>
                <td className="py-3.5 pr-5 text-xs text-muted">{formatDateTime(user.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Pager pagination={state.pagination} onPage={(nextPage) => update({ page: nextPage > 1 ? String(nextPage) : '' })} />
    </>
  )
}