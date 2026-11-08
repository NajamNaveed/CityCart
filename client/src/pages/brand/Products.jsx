import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Download, Plus, Search, Upload } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import ProductImage from '../../components/ProductImage'
import { Notice, PageHeader, Pager, StatusBadge, TableScroll, selectClass, tableHead, tableRow } from '../../components/brand/Bits'
import { useCan } from '../../hooks/useCan'
import { EmptyState, Skeleton } from '../../components/ui'
import ProductImportModal from '../../components/brand/ProductImportModal'
import { downloadFile } from '../../utils/download'
import { btnOutline, btnPine, formatPrice } from '../../ui'

const STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED']

function Stock({ inventory }) {
  if (!inventory) return <span className="text-ink/55">Not set</span>
  const available = inventory.quantity - inventory.reservedQuantity
  return (
    <span>
      {available}
      <span className="ml-1.5 text-xs text-ink/55">of {inventory.quantity}</span>
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
  const can = useCan()
  const canCreate = can('products.create')
  const canImport = canCreate && can('products.update')
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const search = params.get('search') || ''
  const status = params.get('status') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [state, setState] = useState({ key: null, items: [], pagination: null, error: '' })
  const key = JSON.stringify([search, status, page, reloadCount])

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

  async function exportCsv() {
    setExporting(true)
    setExportError('')
    try {
      const res = await api.get('/products/mine/export', { responseType: 'blob' })
      downloadFile(res.data, 'products.csv')
    } catch (err) {
      setExportError(getErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        intro="Everything you sell, including drafts and archived items."
        action={
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={exportCsv} disabled={exporting} className={btnOutline}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            {canImport && (
              <button type="button" onClick={() => setImportOpen(true)} className={btnOutline}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import CSV
              </button>
            )}
            {canCreate && (
              <Link to="/brand/products/new" className={btnPine}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add product
              </Link>
            )}
          </div>
        }
      />
      <Notice>{location.state?.notice}</Notice>
      <Notice tone="warn">{exportError}</Notice>
      <ProductImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => setReloadCount((n) => n + 1)} />

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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/55" aria-hidden="true" />
          <input
            key={search}
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Search by name"
            className="h-10 w-full rounded-tile border border-line-warm bg-paper-warm pl-9 pr-3 text-[13px] text-ink outline-none transition focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
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
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : state.error ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={Search}
          title={search || status ? 'No products match.' : 'You have not added any products yet.'}
          message={!search && !status ? 'Create your first product with photos, price and stock.' : undefined}
          className="rounded-card border border-dashed border-line-warm bg-paper-warm"
          action={
            !search && !status && canCreate ? (
              <Link to="/brand/products/new" className={btnPine}>
                Add your first product
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableScroll label="Products" className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                  <th className="px-5 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((p) => (
                  <tr key={p._id} className={tableRow}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage src={p.images?.[0]} name={p.name} className="size-11 shrink-0 rounded-tile text-sm" />
                        <Link to={`/brand/products/${p._id}`} className="font-medium text-ink transition hover:text-clay">
                          {p.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-ink">{formatPrice(p.price)}</td>
                    <td className="px-4 py-3">
                      <Stock inventory={p.inventory} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/brand/products/${p._id}`}
                        className="rounded-tile border border-line-warm px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-ink"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="space-y-2.5 md:hidden">
            {state.items.map((p) => (
              <li key={p._id} className="rounded-card border border-line-warm bg-paper-warm p-4">
                <div className="flex items-start gap-3">
                  <ProductImage src={p.images?.[0]} name={p.name} className="size-12 shrink-0 rounded-tile text-sm" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/brand/products/${p._id}`} className="block truncate text-[13.5px] font-medium text-ink">
                      {p.name}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-ink/55">{formatPrice(p.price)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge value={p.status} />
                      <span className="text-[11.5px] text-ink/50">
                        <Stock inventory={p.inventory} />
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/brand/products/${p._id}`}
                    className="shrink-0 rounded-tile border border-line-warm px-3 py-1.5 text-[12px] font-medium text-ink"
                  >
                    Edit
                  </Link>
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