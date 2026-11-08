import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, SearchX } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { useCity } from '../../hooks/useCity'
import { PageHeader, Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { formatDateTime, humanize } from '../../ui'

const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'TERMINATED']

export default function Brands() {
  const [params, setParams] = useSearchParams()
  const { cities } = useCity()
  const cityName = Object.fromEntries(cities.map((c) => [c._id, c.name]))
  const search = params.get('search') || ''
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, brands: [], pagination: null, error: '' })
  const key = JSON.stringify([search, status, page])

  useEffect(() => {
    let active = true
    api
      .get('/admin/brands', { params: { limit: 20, page, ...(search && { search }), ...(status && { status }) } })
      .then((res) => active && setState({ key, brands: res.data.brands, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, brands: [], pagination: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [search, status, page, key])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  const loading = state.key !== key

  return (
    <>
      <PageHeader title="Brands" intro="Every brand on the platform, whatever its status." />

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
            Search brands
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/55" aria-hidden="true" />
          <input
            key={search}
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Search by name"
            className="h-10 w-full rounded-tile border border-line-warm bg-paper-warm pl-9 pr-3 text-[13px] text-ink outline-none transition focus:border-ink"
          />
        </form>
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
      ) : state.brands.length === 0 ? (
        <EmptyState icon={SearchX} title="No brands match." className="rounded-card border border-dashed border-line-warm bg-paper-warm" />
      ) : (
        <>
          <TableScroll label="Brands" className="hidden md:block">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-5 py-3 font-medium">Brand</th>
                  <th className="py-3 pr-4 font-medium">City</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {state.brands.map((b) => (
                  <tr key={b._id} className={tableRow}>
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/brands/${b._id}`} className="font-medium text-ink transition hover:text-clay">
                        {b.name}
                      </Link>
                    </td>
                    <td className="py-3.5 pr-4 text-ink/55">{cityName[b.cityId] || '—'}</td>
                    <td className="py-3.5 pr-4">
                      <StatusBadge value={b.status} />
                    </td>
                    <td className="py-3.5 pr-5 text-ink/55">{formatDateTime(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="space-y-3 md:hidden">
            {state.brands.map((b) => (
              <li key={b._id} className="rounded-card border border-line-warm bg-paper-warm p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link to={`/admin/brands/${b._id}`} className="font-medium text-ink transition hover:text-clay">
                    {b.name}
                  </Link>
                  <StatusBadge value={b.status} />
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink/55">
                  {cityName[b.cityId] || 'No city'} · joined {formatDateTime(b.createdAt)}
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