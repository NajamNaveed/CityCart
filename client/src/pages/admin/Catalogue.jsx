import { useCallback, useEffect, useState } from 'react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import ProductImage from '../../components/ProductImage'
import { Notice, PageHeader, Pager, StatusBadge, tableHead, tableRow, tableShell, selectClass } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { categoryLabelFor } from '../../utils/categoryLabel'
import { btnDark, inputClass } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'
const TABS = [
  ['ACTIVE', 'Active'],
  ['PENDING', 'Waiting for approval'],
  ['REJECTED', 'Rejected'],
  ['ARCHIVED', 'Archived'],
]
const smallBtn = 'rounded-md border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-ink disabled:opacity-50'

function emptyForm(item) {
  return {
    name: item?.name ?? '',
    manufacturer: item?.manufacturer ?? '',
    categoryId: item?.categoryId ?? '',
    barcode: item?.barcode ?? '',
    sizeValue: item?.size?.value ?? '',
    sizeUnit: item?.size?.unit ?? '',
    description: item?.description ?? '',
    images: (item?.images ?? []).join('\n'),
  }
}

function toPayload(f, editing) {
  const images = f.images.split('\n').map((l) => l.trim()).filter(Boolean)
  const payload = { name: f.name, categoryId: f.categoryId }
  // When editing, empty text clears the field; when creating, empty fields are left out.
  if (editing || f.manufacturer.trim()) payload.manufacturer = f.manufacturer.trim()
  if (editing || f.description.trim()) payload.description = f.description.trim()
  if (editing || images.length) payload.images = images
  if (f.barcode.trim()) payload.barcode = f.barcode.trim()
  if (f.sizeValue !== '' && f.sizeUnit.trim()) payload.size = { value: Number(f.sizeValue), unit: f.sizeUnit.trim() }
  return payload
}

function ItemForm({ item, categories, onSaved, onCancel }) {
  const editing = Boolean(item)
  const [form, setForm] = useState(emptyForm(item))
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      if (editing) await api.patch(`/admin/catalog/${item._id}`, toPayload(form, true))
      else await api.post('/admin/catalog', toPayload(form, false))
      onSaved(editing ? 'Product updated. Every store listing was refreshed.' : 'Product added to the catalogue.')
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 space-y-4 rounded-lg border border-line bg-white p-5">
      <p className="font-medium text-ink">{editing ? `Edit ${item.name}` : 'Add a catalogue product'}</p>
      {error && (
        <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" id="cat-name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
        <Field label="Made by" id="cat-manufacturer" name="manufacturer" value={form.manufacturer} onChange={onChange} hint="For example Dalda." />
        <div>
          <label htmlFor="cat-category" className={labelClass}>
            Category
          </label>
          <select id="cat-category" name="categoryId" value={form.categoryId} onChange={onChange} className={`${selectClass} h-11 w-full`} required>
            <option value="">Choose a category</option>
            {categories.map((c) =>
              c.children.length > 0 ? (
                <optgroup key={c._id} label={c.name}>
                  {c.children.map((child) => (
                    <option key={child._id} value={child._id}>
                      {child.name}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              )
            )}
          </select>
          {fieldErrors.categoryId && <p className="mt-1.5 text-xs text-clay">{fieldErrors.categoryId}</p>}
        </div>
        <Field label="Barcode" id="cat-barcode" name="barcode" value={form.barcode} onChange={onChange} error={fieldErrors.barcode} hint="6 to 20 letters, digits or dashes. Must be unique." />
        <Field label="Size" id="cat-size-value" name="sizeValue" type="number" min="0" step="any" value={form.sizeValue} onChange={onChange} />
        <Field label="Unit" id="cat-size-unit" name="sizeUnit" value={form.sizeUnit} onChange={onChange} hint="kg, l, m, piece…" />
      </div>
      <div>
        <label htmlFor="cat-description" className={labelClass}>
          Description
        </label>
        <textarea id="cat-description" name="description" rows={3} value={form.description} onChange={onChange} className={`${inputClass} py-3`} />
      </div>
      <div>
        <label htmlFor="cat-images" className={labelClass}>
          Photo links (one per line)
        </label>
        <textarea id="cat-images" name="images" rows={3} value={form.images} onChange={onChange} className={`${inputClass} py-3`} placeholder="https://…" />
        {fieldErrors.images && <p className="mt-1.5 text-xs text-clay">{fieldErrors.images}</p>}
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving || !form.name.trim() || !form.categoryId} className={btnDark}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex h-11 items-center rounded-md border border-line bg-white px-5 text-[13px] font-medium text-ink transition hover:border-ink">
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Pick the item a duplicate should be merged into. */
function MergePanel({ from, onMerge, onCancel }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  useEffect(() => {
    if (!q.trim()) return undefined
    let active = true
    const timer = setTimeout(() => {
      api
        .get('/admin/catalog', { params: { q: q.trim(), status: 'ACTIVE', scope: 'GLOBAL', limit: 6 } })
        .then((res) => active && setResults(res.data.items.filter((i) => i._id !== from._id)))
        .catch(() => active && setResults([]))
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [q, from._id])
  return (
    <div className="mb-6 rounded-lg border border-line bg-white p-5">
      <p className="font-medium text-ink">Merge “{from.name}” into another product</p>
      <p className="mt-1 text-[13px] text-muted">Every store listing moves to the product you choose, and this one is archived.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the product it duplicates" className={`mt-3 h-11 ${inputClass}`} aria-label="Search the product to merge into" />
      <ul className="mt-3 space-y-2">
        {(q.trim() ? results : []).map((item) => (
          <li key={item._id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13.5px]">
            <span className="min-w-0 truncate">{item.name}</span>
            <button type="button" onClick={() => onMerge(item)} className={smallBtn}>
              Merge into this
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel} className="mt-3 text-[13px] font-medium text-muted underline">
        Cancel
      </button>
    </div>
  )
}

export default function Catalogue() {
  const [categories, setCategories] = useState([])
  const [status, setStatus] = useState('ACTIVE')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [panel, setPanel] = useState(null) // { type: 'add' | 'edit' | 'merge', item? }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  useEffect(() => {
    api
      .get('/categories/tree')
      .then((res) => setCategories(res.data.categories))
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      api
        .get('/admin/catalog', { params: { status, page, limit: 15, ...(q.trim() && { q: q.trim() }) } })
        .then((res) => {
          if (active) {
            setData(res.data)
            setLoadError('')
          }
        })
        .catch((err) => active && setLoadError(getErrorMessage(err)))
    }, q ? 300 : 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [status, q, page, reload])

  const run = useCallback(async (action, success) => {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      await action()
      setMessage({ text: success, tone: 'ok' })
      setPanel(null)
      setReload((n) => n + 1)
    } catch (err) {
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
  }, [])

  function reject(item) {
    const note = window.prompt(`Why is "${item.name}" not approved? The store will see this.`)
    if (note && note.trim()) run(() => api.post(`/admin/catalog/${item._id}/reject`, { note: note.trim() }), 'Request rejected.')
  }

  const saved = (text) => {
    setMessage({ text, tone: 'ok' })
    setPanel(null)
    setReload((n) => n + 1)
  }

  return (
    <>
      <PageHeader
        title="Catalogue"
        intro="One record for each real product, shared by every store that sells it. Stores add their own price and stock on top."
        action={
          <button type="button" onClick={() => setPanel({ type: 'add' })} className={btnDark}>
            Add product
          </button>
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      {panel?.type === 'add' && <ItemForm categories={categories} onSaved={saved} onCancel={() => setPanel(null)} />}
      {panel?.type === 'edit' && <ItemForm key={panel.item._id} item={panel.item} categories={categories} onSaved={saved} onCancel={() => setPanel(null)} />}
      {panel?.type === 'merge' && (
        <MergePanel
          from={panel.item}
          onCancel={() => setPanel(null)}
          onMerge={(into) => run(() => api.post(`/admin/catalog/${panel.item._id}/merge`, { intoId: into._id }), 'Merged. Store listings now point at the chosen product.')}
        />
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatus(value)
              setPage(1)
            }}
            className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${status === value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink'}`}
          >
            {label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Search name, maker or barcode"
          aria-label="Search the catalogue"
          className={`ml-auto h-10 w-full sm:w-72 ${inputClass}`}
        />
      </div>

      {loadError ? (
        <p className="text-clay">{loadError}</p>
      ) : !data ? (
        <Skeleton className="h-40" />
      ) : data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">Nothing here.</p>
      ) : (
        <div className={tableShell}>
          <table className="w-full text-left text-[13.5px]">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Kind</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item._id} className={tableRow}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <ProductImage src={item.images?.[0]} name={item.name} className="h-10 w-10 shrink-0 rounded object-cover" width={80} />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{item.name}</span>
                        <span className="block text-xs text-muted">
                          {[item.manufacturer, item.size?.value ? `${item.size.value} ${item.size.unit}` : '', item.barcode].filter(Boolean).join(' · ')}
                        </span>
                        {item.status === 'REJECTED' && item.reviewNote && <span className="block text-xs text-clay">{item.reviewNote}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{categoryLabelFor(categories, item.categoryId)}</td>
                  <td className="px-5 py-3 text-muted">{item.scope === 'PRIVATE' ? 'Private to one store' : item.brandId ? 'Requested by a store' : 'Platform'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge value={item.status} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex flex-wrap justify-end gap-2">
                      {item.status === 'PENDING' && (
                        <>
                          <button type="button" disabled={busy} onClick={() => run(() => api.post(`/admin/catalog/${item._id}/approve`), 'Approved. Every store can list it now.')} className={smallBtn}>
                            Approve
                          </button>
                          <button type="button" disabled={busy} onClick={() => reject(item)} className={`${smallBtn} text-danger`}>
                            Reject
                          </button>
                        </>
                      )}
                      {item.status !== 'ARCHIVED' && (
                        <button type="button" onClick={() => setPanel({ type: 'edit', item })} className={smallBtn}>
                          Edit
                        </button>
                      )}
                      {item.status === 'ACTIVE' && item.scope === 'GLOBAL' && (
                        <button type="button" onClick={() => setPanel({ type: 'merge', item })} className={smallBtn}>
                          Merge
                        </button>
                      )}
                      {item.status !== 'ARCHIVED' && (
                        <button type="button" disabled={busy} onClick={() => run(() => api.delete(`/admin/catalog/${item._id}`), 'Archived.')} className={`${smallBtn} text-danger`}>
                          Archive
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager pagination={data?.pagination} onPage={setPage} />
    </>
  )
}
