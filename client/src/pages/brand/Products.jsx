import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import ProductImage from '../../components/ProductImage'
import { Notice, PageHeader, Pager, StatusBadge, selectClass } from '../../components/brand/Bits'
import { btnPine, formatPrice, inputClass } from '../../ui'

const STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED']

function Stock({ inventory }) {
  if (!inventory) return <span className="text-muted">Not set</span>
  const available = inventory.quantity - inventory.reservedQuantity
  return (
    <span>
      {available}
      <span className="ml-1.5 text-xs text-muted">of {inventory.quantity}</span>
      {inventory.stockStatus && inventory.stockStatus !== 'IN_STOCK' && (
        <span className="ml-2 align-middle">
          <StatusBadge value={inventory.stockStatus} />
        </span>
      )}
    </span>
  )
}

export default function Products() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const search = params.get('search') || ''
  const status = params.get('status') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([search, status, page])

  useEffect(() => {
    let active = true
    api
      .get('/products/mine', { params: { limit: 15, page, ...(search && { search }), ...(status && { status }) } })
      .then((res) => active && setState({ key, items: res.data.products, pagination: res.data.pagination, error: '' }))
      .catch((err) => active && setState({ key, items: [], pagination: null, error: getErrorMessage(err) }))
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
      <PageHeader
        title="Products"
        intro="Everything you sell, including drafts and archived items."
        action={
          <Link to="/brand/products/new" className={btnPine}>
            Add product
          </Link>
        }
      />
      <Notice>{location.state?.notice}</Notice>

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
            Search products
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
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse bg-sand" />
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        <div className="border border-dashed border-line py-16 text-center">
          <p className="font-medium">{search || status ? 'No products match.' : 'You have not added any products yet.'}</p>
          {!search && !status && (
            <Link to="/brand/products/new" className={`${btnPine} mt-5`}>
              Add your first product
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                <th className="py-3 pr-4 font-medium">Product</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 text-right font-medium">Price</th>
                <th className="py-3 pr-4 font-medium">In stock</th>
                <th className="py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.items.map((p) => (
                <tr key={p._id}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <ProductImage src={p.images?.[0]} name={p.name} className="size-12 shrink-0 text-sm" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge value={p.status} />
                  </td>
                  <td className="py-3 pr-4 text-right">{formatPrice(p.price)}</td>
                  <td className="py-3 pr-4">
                    <Stock inventory={p.inventory} />
                  </td>
                  <td className="py-3 text-right">
                    <Link to={`/brand/products/${p._id}`} className="font-medium text-pine hover:underline">
                      Edit
                    </Link>
                  </td>
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