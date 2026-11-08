import { useCallback, useEffect, useState } from 'react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import ProductImage from '../../components/ProductImage'
import { Notice, PageHeader, Pager, StatusBadge, TableScroll, tableHead, tableRow, selectClass } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import useReadOnly from '../../hooks/useReadOnly'
import { categoryLabelFor } from '../../utils/categoryLabel'
import { btnDark, inputClass } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-ink/55'
const TABS = [
  ['ACTIVE', 'Active'],
  ['PENDING', 'Waiting for approval'],
  ['REJECTED', 'Rejected'],
  ['ARCHIVED', 'Archived'],
]
const smallBtn = 'rounded-tile border border-line-warm px-3 py-1.5 text-[12.5px] font-medium text-ink transition hover:border-ink disabled:opacity-50'

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
    <form onSubmit={submit} className="mb-6 space-y-4 rounded-card border border-line-warm bg-paper-warm p-5">
      <p className="font-medium text-ink">{editing ? `Edit ${item.name}` : 'Add a catalogue product'}</p>
      {error && (
        <p role="alert" className="rounded-tile bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
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
        <button type="button" onClick={onCancel} className="inline-flex h-11 items-center rounded-tile border border-line-warm bg-paper-warm px-5 text-[13px] font-medium text-ink transition hover:border-ink">
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
    <div className="mb-6 rounded-card border border-line-warm bg-paper-warm p-5">
      <p className="font-medium text-ink">Merge “{from.name}” into another product</p>
      <p className="mt-1 text-[13px] text-ink/55">Every store listing moves to the product you choose, and this one is archived.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the product it duplicates" className={`mt-3 h-11 ${inputClass}`} aria-label="Search the product to merge into" />
      <ul className="mt-3 space-y-2">
        {(q.trim() ? results : []).map((item) => (
          <li key={item._id} className="flex items-center justify-between gap-3 rounded-tile border border-line-warm px-3 py-2 text-[13.5px]">
            <span className="min-w-0 truncate">{item.name}</span>
            <button type="button" onClick={() => onMerge(item)} className={smallBtn}>
              Merge into this
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel} className="mt-3 text-[13px] font-medium text-ink/55 underline">
        Cancel
      </button>
    </div>
  )
}

export default function Catalogue() {
  const readOnly = useReadOnly()
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
  const [selected, setSelected] = useState(() => new Set())
  const [rejectTarget, setRejectTarget] = useState(null) // { ids: string[], name?: string }
  const [rejectNote, setRejectNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [archiveId, setArchiveId] = useState(null)

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

  const pending = (data?.items || []).filter((item) => item.status === 'PENDING')
  const selectable = status === 'PENDING' && !readOnly
  const selectedPending = pending.filter((item) => selected.has(item._id))
  const allPendingSelected = pending.length > 0 && selectedPending.length === pending.length

  const resetSelection = () => setSelected(new Set())

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allPendingSelected ? new Set() : new Set(pending.map((item) => item._id)))
  }

  function openReject(ids, name) {
    setRejectNote('')
    setRejectTarget({ ids, ...(name && { name }) })
  }

  async function submitReject(event) {
    event.preventDefault()
    const note = rejectNote.trim()
    if (!note || !rejectTarget) return
    const { ids, name } = rejectTarget
    setBulkBusy(true)
    setMessage({ text: '', tone: 'ok' })
    const results = await Promise.allSettled(ids.map((id) => api.post(`/admin/catalog/${id}/reject`, { note })))
    const failed = results.filter((result) => result.status === 'rejected').length
    setBulkBusy(false)
    setRejectTarget(null)
    setRejectNote('')
    if (ids.length > 1) resetSelection()
    setReload((n) => n + 1)
    setMessage(
      failed
        ? { text: `${ids.length - failed} of ${ids.length} rejected. ${failed} could not be rejected — try again.`, tone: 'warn' }
        : { text: name ? 'Request rejected.' : `${ids.length} ${ids.length === 1 ? 'request' : 'requests'} rejected.`, tone: 'ok' },
    )
  }

  async function bulkApprove() {
    const ids = selectedPending.map((item) => item._id)
    if (!ids.length) return
    setBulkBusy(true)
    setMessage({ text: '', tone: 'ok' })
    const results = await Promise.allSettled(ids.map((id) => api.post(`/admin/catalog/${id}/approve`)))
    const failed = results.filter((result) => result.status === 'rejected').length
    setBulkBusy(false)
    resetSelection()
    setReload((n) => n + 1)
    setMessage(
      failed
        ? { text: `${ids.length - failed} of ${ids.length} approved. ${failed} could not be approved — try again.`, tone: 'warn' }
        : { text: `${ids.length} ${ids.length === 1 ? 'product' : 'products'} approved. Stores can list them now.`, tone: 'ok' },
    )
  }

  const saved = (text) => {
    setMessage({ text, tone: 'ok' })
    setPanel(null)
    setReload((n) => n + 1)
  }

  const itemActions = (item) => {
    if (readOnly) return <span className="text-[12.5px] text-ink/55">View only</span>
    return (
    <>
      {item.status === 'PENDING' && (
        <>
          <button type="button" disabled={busy || bulkBusy} onClick={() => run(() => api.post(`/admin/catalog/${item._id}/approve`), 'Approved. Every store can list it now.')} className={smallBtn}>
            Approve
          </button>
          <button type="button" disabled={busy || bulkBusy} onClick={() => openReject([item._id], item.name)} className={`${smallBtn} text-clay`}>
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
      {item.status !== 'ARCHIVED' &&
        (archiveId === item._id ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await run(() => api.delete(`/admin/catalog/${item._id}`), 'Archived.')
                setArchiveId(null)
              }}
              className="rounded-tile bg-clay px-3 py-1.5 text-[12.5px] font-medium text-cream transition hover:bg-clay-dark disabled:opacity-50"
            >
              Yes, archive
            </button>
            <button type="button" onClick={() => setArchiveId(null)} className={smallBtn}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => setArchiveId(item._id)} className={`${smallBtn} text-clay`}>
            Archive
          </button>
        ))}
    </>
    )
  }

  return (
    <>
      <PageHeader
        title="Catalogue"
        intro="One record for each real product, shared by every store that sells it. Stores add their own price and stock on top."
        action={
          <button type="button" disabled={readOnly} onClick={() => setPanel({ type: 'add' })} className={`${btnDark} disabled:cursor-not-allowed disabled:opacity-40`}>
            Add product
          </button>
        }
      />
      <Notice tone={message.tone}>{message.text}</Notice>
      {readOnly && (
        <p className="mb-5 text-[12.5px] text-ink/55">Your access is read-only, so the catalogue cannot be changed.</p>
      )}

      {rejectTarget && (
        <form onSubmit={submitReject} className="mb-6 space-y-3 rounded-card border border-clay/25 bg-clay/10 p-5">
          <p className="font-medium text-ink">
            {rejectTarget.name ? `Reject “${rejectTarget.name}”` : `Reject ${rejectTarget.ids.length} selected products`}
          </p>
          <div>
            <label htmlFor="reject-note" className={labelClass}>
              Why? The store will see this.
            </label>
            <textarea
              id="reject-note"
              rows={2}
              maxLength={500}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className={`${inputClass} py-2.5`}
              required
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={bulkBusy || !rejectNote.trim()}
              className="inline-flex h-10 items-center rounded-tile bg-clay px-4 text-[13px] font-medium text-cream transition hover:bg-clay-dark disabled:opacity-50"
            >
              {bulkBusy ? 'Rejecting…' : 'Reject'}
            </button>
            <button type="button" onClick={() => setRejectTarget(null)} className={smallBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}

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
              resetSelection()
            }}
            className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${status === value ? 'border-ink bg-noir text-cream' : 'border-line-warm bg-paper-warm text-ink hover:border-ink'}`}
          >
            {label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
            resetSelection()
          }}
          placeholder="Search name, maker or barcode"
          aria-label="Search the catalogue"
          className={`ml-auto h-10 w-full sm:w-72 ${inputClass}`}
        />
      </div>

      {selectable && pending.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-tile border border-line-warm bg-sand/40 px-4 py-3">
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-line-warm accent-forest"
            />
            Select all on this page
          </label>
          {selectedPending.length > 0 && (
            <>
              <span className="text-[12.5px] text-ink/55">{selectedPending.length} selected</span>
              <span className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={bulkApprove}
                  className="inline-flex h-9 items-center rounded-tile bg-forest px-3.5 text-[12.5px] font-medium text-cream transition hover:bg-forest-deep disabled:opacity-50"
                >
                  {bulkBusy ? 'Working…' : `Approve ${selectedPending.length}`}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => openReject(selectedPending.map((item) => item._id))}
                  className="inline-flex h-9 items-center rounded-tile border border-clay/40 px-3.5 text-[12.5px] font-medium text-clay transition hover:border-clay disabled:opacity-50"
                >
                  Reject selected
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {loadError ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{loadError}</p>
      ) : !data ? (
        <Skeleton className="h-40" />
      ) : data.items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-warm bg-paper-warm p-8 text-center text-sm text-ink/55">Nothing here.</p>
      ) : (
        <>
          <TableScroll label="Catalogue products" className="hidden md:block">
            <table className="w-full min-w-[760px] text-left text-[13.5px]">
              <thead className={tableHead}>
                <tr>
                  {selectable && (
                    <th className="w-10 px-4 py-3">
                      <span className="sr-only">Select</span>
                    </th>
                  )}
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
                    {selectable && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(item._id)}
                          onChange={() => toggle(item._id)}
                          aria-label={`Select ${item.name}`}
                          className="h-4 w-4 rounded border-line-warm accent-forest"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <ProductImage src={item.images?.[0]} name={item.name} className="h-10 w-10 shrink-0 rounded object-cover" width={80} />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink">{item.name}</span>
                          <span className="block text-xs text-ink/55">
                            {[item.manufacturer, item.size?.value ? `${item.size.value} ${item.size.unit}` : '', item.barcode].filter(Boolean).join(' · ')}
                          </span>
                          {item.status === 'REJECTED' && item.reviewNote && <span className="block text-xs text-clay">{item.reviewNote}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink/55">{categoryLabelFor(categories, item.categoryId)}</td>
                    <td className="px-5 py-3 text-ink/55">{item.scope === 'PRIVATE' ? 'Private to one store' : item.brandId ? 'Requested by a store' : 'Platform'}</td>
                    <td className="px-5 py-3">
                      <StatusBadge value={item.status} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex flex-wrap justify-end gap-2">{itemActions(item)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="space-y-3 md:hidden">
            {data.items.map((item) => (
              <li key={item._id} className="rounded-card border border-line-warm bg-paper-warm p-4">
                <div className="flex gap-3">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={selected.has(item._id)}
                      onChange={() => toggle(item._id)}
                      aria-label={`Select ${item.name}`}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-line-warm accent-forest"
                    />
                  )}
                  <ProductImage src={item.images?.[0]} name={item.name} className="h-12 w-12 shrink-0 rounded object-cover" width={80} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="mt-0.5 text-xs text-ink/55">
                      {[item.manufacturer, item.size?.value ? `${item.size.value} ${item.size.unit}` : ''].filter(Boolean).join(' · ') || 'No maker listed'}
                    </p>
                    {item.status === 'REJECTED' && item.reviewNote && <p className="mt-1 text-xs text-clay">{item.reviewNote}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink/55">
                  <StatusBadge value={item.status} />
                  <span>{categoryLabelFor(categories, item.categoryId)}</span>
                  <span>{item.scope === 'PRIVATE' ? 'Private' : item.brandId ? 'Store request' : 'Platform'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line-warm pt-3">{itemActions(item)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pager
        pagination={data?.pagination}
        onPage={(value) => {
          setPage(value)
          resetSelection()
        }}
      />
    </>
  )
}
