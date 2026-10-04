import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import { useCity } from '../../hooks/useCity'
import { PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { formatDateTime, humanize, inputClass } from '../../ui'

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

      <div className="mb-6 flex flex-wrap gap-3">
        <form
          role="search"
          className="flex flex-1 basis-60 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            update({ search: new FormData(e.currentTarget).get('q').toString().trim() })
          }}
        >
          <label htmlFor="q" className="sr-only">
            Search brands
          </label>
          <input key={search} id="q" name="q" defaultValue={search} placeholder="Search by name" className={`h-10 min-w-0 flex-1 ${inputClass}`} />
          <button type="submit" className="h-10 rounded-sm bg-ink px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-cream hover:bg-black">
            Search
          </button>
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
        <div className="h-48 animate-pulse bg-sand" />
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.brands.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">No brands match.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                <th className="py-3 pr-4 font-medium">Brand</th>
                <th className="py-3 pr-4 font-medium">City</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.brands.map((b) => (
                <tr key={b._id} className="hover:bg-sand/60">
                  <td className="py-3 pr-4">
                    <Link to={`/admin/brands/${b._id}`} className="font-medium text-clay hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-muted">{cityName[b.cityId] || '—'}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge value={b.status} />
                  </td>
                  <td className="py-3 text-muted">{formatDateTime(b.createdAt)}</td>
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