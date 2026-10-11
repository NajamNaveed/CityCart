import { useEffect, useState } from 'react'
import { Search, Warehouse } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api, { getErrorMessage } from '../../services/api'
import Field from '../../components/Field'
import ProductImage from '../../components/ProductImage'
import { EmptyState, Skeleton } from '../../components/ui'
import { Notice, PageHeader, Pager, StatusBadge, tableHead, tableRow, tableShell } from '../../components/brand/Bits'
import { btnPine } from '../../ui'

export default function InventoryHub() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const key = JSON.stringify([search, page])
  const [state, setState] = useState({ key: null, products: [], pagination: null, error: '' })
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [rowErrors, setRowErrors] = useState({})
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    api.get('/products/mine', { params: { search: search || undefined, page, limit: 20 } })
      .then(({ data }) => {
        if (!current) return
        setState({ key, products: data.products, pagination: data.pagination, error: '' })
        setDraft(Object.fromEntries(data.products.map((product) => [product._id, {
          quantity: String(product.inventory?.quantity ?? 0),
          lowStockThreshold: String(product.inventory?.lowStockThreshold ?? 0),
        }])))
      })
      .catch((err) => current && setState({ key, products: [], pagination: null, error: getErrorMessage(err) }))
    return () => { current = false }
  }, [search, page, key, reload])

  function update(patch) {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([name, value]) => (value ? next.set(name, value) : next.delete(name)))
    setParams(next)
  }

  async function save(event) {
    event.preventDefault()
    const updates = state.products.filter((product) => {
      const row = draft[product._id]
      return row && (
        Number(row.quantity) !== (product.inventory?.quantity ?? 0) ||
        Number(row.lowStockThreshold) !== (product.inventory?.lowStockThreshold ?? 0)
      )
    }).map((product) => ({
      productId: product._id,
      quantity: Number(draft[product._id].quantity),
      lowStockThreshold: Number(draft[product._id].lowStockThreshold),
    }))

    if (!updates.length) {
      setMessage({ text: 'There are no stock changes to save.', tone: 'ok' })
      return
    }
    setSaving(true)
    setMessage({ text: '', tone: 'ok' })
    setRowErrors({})
    try {
      const { data } = await api.patch('/inventory/batch', { updates })
      const errors = Object.fromEntries(data.results.filter((result) => !result.success).map((result) => [result.productId, result.message]))
      setRowErrors(errors)
      setMessage({
        text: data.failedCount ? `${data.updatedCount} updated; ${data.failedCount} need attention.` : `${data.updatedCount} stock rows updated.`,
        tone: data.failedCount ? 'warn' : 'ok',
      })
      setReload((value) => value + 1)
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  const loading = state.key !== key
  return (
    <>
      <PageHeader title="Quick inventory" intro="Adjust stock and low-stock thresholds across your catalogue." />
      <Notice tone={message.tone}>{message.text}</Notice>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <form role="search" className="relative min-w-0 flex-1 basis-56" onSubmit={(event) => {
          event.preventDefault()
          update({ search: new FormData(event.currentTarget).get('search').toString().trim() })
        }}>
          <label htmlFor="inventory-search" className="sr-only">Search inventory products</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input key={search} id="inventory-search" name="search" defaultValue={search} placeholder="Search products by name" className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-[13px] text-ink outline-none focus:border-ink" />
        </form>
        {!loading && state.pagination && <p className="pb-2 text-xs text-muted">{state.pagination.total} products</p>}
      </div>
      {loading ? (
        <div className="space-y-2.5">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-16 w-full rounded-lg" />)}</div>
      ) : state.error ? (
        <p role="alert" className="text-clay">{state.error}</p>
      ) : state.products.length === 0 ? (
        <EmptyState icon={Warehouse} title={search ? 'No products match.' : 'No products yet.'} message={search ? undefined : 'Add products before managing stock.'} className="rounded-lg border border-dashed border-line bg-white" />
      ) : (
        <form onSubmit={save}>
          <div className={tableShell}>
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead><tr className={tableHead}>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="py-3 pr-4 font-medium">Availability</th>
                <th className="w-36 py-3 pr-4 font-medium">Total stock</th>
                <th className="w-36 py-3 pr-5 font-medium">Low-stock alert</th>
              </tr></thead>
              <tbody>{state.products.map((product) => {
                const row = draft[product._id] || { quantity: '0', lowStockThreshold: '0' }
                const reserved = product.inventory?.reservedQuantity ?? 0
                return (
                  <tr key={product._id} className={tableRow}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage src={product.images?.[0]} name={product.name} className="size-10 shrink-0 rounded-md text-sm" />
                        <div className="min-w-0"><span className="block truncate font-medium text-ink">{product.name}</span><span className="text-xs text-muted">{product.sku || product.status}</span></div>
                      </div>
                      {rowErrors[product._id] && <p role="alert" className="mt-1 text-xs text-clay">{rowErrors[product._id]}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge value={Number(row.quantity) - reserved <= 0 ? 'OUT_OF_STOCK' : Number(row.quantity) - reserved <= Number(row.lowStockThreshold) ? 'LOW_STOCK' : 'IN_STOCK'} />
                      <span className="ml-2 text-xs text-muted">{Math.max(0, Number(row.quantity) - reserved)} available</span>
                    </td>
                    <td className="py-3 pr-4"><Field label="" id={`quantity-${product._id}`} type="number" min={reserved} step="1" aria-label={`Total stock for ${product.name}`} value={row.quantity} onChange={(event) => setDraft((current) => ({ ...current, [product._id]: { ...row, quantity: event.target.value } }))} /></td>
                    <td className="py-3 pr-5"><Field label="" id={`threshold-${product._id}`} type="number" min="0" step="1" aria-label={`Low-stock threshold for ${product.name}`} value={row.lowStockThreshold} onChange={(event) => setDraft((current) => ({ ...current, [product._id]: { ...row, lowStockThreshold: event.target.value } }))} /></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><button type="submit" disabled={saving} className={btnPine}>{saving ? 'Saving…' : 'Save stock changes'}</button></div>
        </form>
      )}
      <Pager pagination={state.pagination} onPage={(nextPage) => update({ page: nextPage > 1 ? String(nextPage) : '' })} />
    </>
  )
}