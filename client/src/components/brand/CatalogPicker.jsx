import { useEffect, useState } from 'react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../Field'
import ImageUploader from './ImageUploader'
import ProductImage from '../ProductImage'
import { btnDark, inputClass } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

function sizeText(size) {
  return size?.value ? `${size.value} ${size.unit}` : ''
}

/** A catalogue item as a read-only card: its name, maker, size, category, photos and text come from the catalogue. */
export function CatalogItemCard({ item, categoryLabel, onChange }) {
  const details = [item.manufacturer, sizeText(item.size), categoryLabel].filter(Boolean).join(' · ')
  return (
    <div className="flex gap-4 rounded-lg border border-line bg-white p-5">
      <ProductImage src={item.images?.[0]} name={item.name} className="h-24 w-24 shrink-0 rounded-md object-cover" width={200} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{item.name}</p>
        {details && <p className="mt-0.5 text-[13px] text-muted">{details}</p>}
        {item.description && <p className="mt-2 line-clamp-3 text-[13px] text-ink">{item.description}</p>}
        <p className="mt-2 text-xs text-muted">
          The name, photos and description come from the CityCart catalogue. You set the price, stock and branches.
        </p>
        {onChange && (
          <button type="button" onClick={onChange} className="mt-2 text-[13px] font-medium text-pine underline">
            Choose a different product
          </button>
        )}
      </div>
    </div>
  )
}

const STATUS_TEXT = {
  PENDING: 'Waiting for approval',
  REJECTED: 'Not approved',
  ACTIVE: 'Approved',
}

/** Requests the store sent and its own private items, so it can follow what happened. */
function MyRequests({ refresh, onUse }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    let active = true
    api
      .get('/catalog/mine', { params: { limit: 20 } })
      .then((res) => active && setItems(res.data.items))
      .catch(() => active && setItems([]))
    return () => {
      active = false
    }
  }, [refresh])
  if (items.length === 0) return null
  return (
    <div className="mt-6">
      <p className={labelClass}>Your requests</p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {items.map((item) => (
          <li key={item._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
            <span className="min-w-0">
              <span className="font-medium text-ink">{item.name}</span>
              <span className="ml-2 text-xs text-muted">
                {item.scope === 'PRIVATE' ? 'Private to your store' : STATUS_TEXT[item.status] || item.status}
              </span>
              {item.status === 'REJECTED' && item.reviewNote && <span className="mt-0.5 block text-xs text-clay">{item.reviewNote}</span>}
            </span>
            {item.status === 'ACTIVE' && (
              <button type="button" onClick={() => onUse(item)} className="text-[13px] font-medium text-pine underline">
                Use this
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RequestForm({ categories, onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', manufacturer: '', categoryId: '', description: '', barcode: '', sizeValue: '', sizeUnit: '' })
  const [images, setImages] = useState([])
  const [isPrivate, setIsPrivate] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setSaving(true)
    const payload = {
      name: form.name,
      categoryId: form.categoryId,
      ...(form.manufacturer.trim() && { manufacturer: form.manufacturer.trim() }),
      ...(form.description.trim() && { description: form.description.trim() }),
      ...(form.barcode.trim() && { barcode: form.barcode.trim() }),
      ...(form.sizeValue !== '' && form.sizeUnit.trim() && { size: { value: Number(form.sizeValue), unit: form.sizeUnit.trim() } }),
      ...(images.length && { images }),
      ...(isPrivate && { private: true }),
    }
    try {
      const res = await api.post('/catalog/requests', payload)
      onDone(res.data.item)
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-line bg-paper p-5">
      <p className="font-medium text-ink">Request a new product</p>
      {error && (
        <p role="alert" className="rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" id="req-name" name="name" value={form.name} onChange={onChange} error={fieldErrors.name} required />
        <Field label="Made by" id="req-manufacturer" name="manufacturer" value={form.manufacturer} onChange={onChange} hint="Optional. For example Dalda." />
        <div>
          <label htmlFor="req-category" className={labelClass}>
            Category
          </label>
          <select id="req-category" name="categoryId" value={form.categoryId} onChange={onChange} className={`h-11 ${inputClass} ${fieldErrors.categoryId ? 'border-clay' : ''}`} required>
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
        <Field label="Barcode" id="req-barcode" name="barcode" value={form.barcode} onChange={onChange} error={fieldErrors.barcode} hint="Optional. Helps avoid duplicates." />
        <Field label="Size" id="req-size-value" name="sizeValue" type="number" min="0" step="any" value={form.sizeValue} onChange={onChange} hint="Optional. For example 1" />
        <Field label="Unit" id="req-size-unit" name="sizeUnit" value={form.sizeUnit} onChange={onChange} hint="For example kg, l, m or piece." />
      </div>
      <div>
        <label htmlFor="req-description" className={labelClass}>
          Description
        </label>
        <textarea id="req-description" name="description" rows={3} value={form.description} onChange={onChange} className={`${inputClass} py-3`} />
      </div>
      <div>
        <p className={labelClass}>Photos</p>
        <ImageUploader images={images} onChange={setImages} name={form.name || 'Product'} />
      </div>
      <label className="flex items-start gap-2.5 text-[13.5px] text-ink">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-0.5 accent-[#1e3a2f]" />
        <span>
          Only my store can use this product
          <span className="block text-xs text-muted">Usable straight away, never shown to other stores. Leave it off to share it with every store after the CityCart admin approves it.</span>
        </span>
      </label>
      <div className="flex gap-3">
        <button type="button" onClick={submit} disabled={saving || !form.name.trim() || !form.categoryId} className={btnDark}>
          {saving ? 'Sending…' : isPrivate ? 'Create private product' : 'Send request'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex h-11 items-center rounded-md border border-line bg-white px-5 text-[13px] font-medium text-ink transition hover:border-ink">
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Find a product in the shared catalogue to list in the store, or ask for a new one.
 * Calls onSelect(item) with the chosen catalogue item.
 */
export default function CatalogPicker({ categories, onSelect }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null) // null while loading
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [sent, setSent] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      api
        .get('/catalog', { params: { limit: 8, ...(q.trim() && { q: q.trim() }) } })
        .then((res) => {
          if (active) {
            setResults(res.data.items)
            setError('')
          }
        })
        .catch((err) => active && setError(getErrorMessage(err)))
    }, q ? 300 : 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [q, refresh])

  function requested(item) {
    setRequesting(false)
    setRefresh((n) => n + 1)
    if (item.scope === 'PRIVATE') {
      onSelect(item)
    } else {
      setSent(`"${item.name}" was sent to the CityCart admin. You can list it once it is approved.`)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-6">
      <label htmlFor="catalog-search" className={labelClass}>
        Find the product
      </label>
      <input
        id="catalog-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, maker or barcode"
        className={`h-11 ${inputClass}`}
        autoComplete="off"
      />
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      {sent && <p className="mt-3 rounded-md bg-pine/5 px-3.5 py-2.5 text-sm text-ink">{sent}</p>}

      {results && results.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {results.map((item) => (
            <li key={item._id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2.5 text-left transition hover:border-ink"
              >
                <ProductImage src={item.images?.[0]} name={item.name} className="h-12 w-12 shrink-0 rounded object-cover" width={100} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{item.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {[item.manufacturer, sizeText(item.size), item.scope === 'PRIVATE' ? 'Private' : ''].filter(Boolean).join(' · ') || 'Catalogue product'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && <p className="mt-4 text-sm text-muted">Nothing in the catalogue matches. You can request it below.</p>}

      {!requesting && (
        <button type="button" onClick={() => setRequesting(true)} className="mt-4 text-[13.5px] font-medium text-pine underline">
          Can't find it? Request a new product
        </button>
      )}
      {requesting && <RequestForm categories={categories} onDone={requested} onCancel={() => setRequesting(false)} />}
      <MyRequests refresh={refresh} onUse={onSelect} />
    </div>
  )
}
