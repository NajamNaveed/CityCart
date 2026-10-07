import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import ProductImage from '../../components/ProductImage'
import { Notice, PageHeader, Pager, StatusBadge, selectClass, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { useCan } from '../../hooks/useCan'
import { EmptyState, Skeleton } from '../../components/ui'
import { btnPine, formatPrice } from '../../ui'

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
  const canCreate = useCan()('products.create')
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
          canCreate && (
            <Link to="/brand/products/new" className={btnPine}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add product
            </Link>
          )
        }
      />
      <Notice>{location.state?.notice}</Notice>

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
            Search products
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            key={search}
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Search by name"
            className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-[13px] text-ink outline-none transition focus:border-ink"
          />
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
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={Search}
          title={search || status ? 'No products match.' : 'You have not added any products yet.'}
          message={!search && !status ? 'Create your first product with photos, price and stock.' : undefined}
          className="rounded-lg border border-dashed border-line bg-white"
          action={
            !search && !status && canCreate ? (
              <Link to="/brand/products/new" className={btnPine}>
                Add your first product
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={tableShell}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className={tableHead}>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 text-right font-medium">Price</th>
                <th className="py-3 pr-4 font-medium">In stock</th>
                <th className="py-3 pr-5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((p) => (
                <tr key={p._id} className={tableRow}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <ProductImage src={p.images?.[0]} name={p.name} className="size-11 shrink-0 rounded-md text-sm" />
                      <Link to={`/brand/products/${p._id}`} className="font-medium text-ink transition hover:text-pine">
                        {p.name}
                      </Link>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge value={p.status} />
                  </td>
                  <td className="py-3 pr-4 text-right text-ink">{formatPrice(p.price)}</td>
                  <td className="py-3 pr-4">
                    <Stock inventory={p.inventory} />
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <Link
                      to={`/brand/products/${p._id}`}
                      className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-ink"
                    >
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