import { useEffect, useState } from 'react'
import { Clock3, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import ImageUploader from '../../components/brand/ImageUploader'
import ProductImage from '../../components/ProductImage'
import { Notice, PageHeader, StatusBadge } from '../../components/brand/Bits'
import { EmptyState, Skeleton } from '../../components/ui'
import { uploadProviderImage } from '../../services/uploads'
import { btnOutline, btnPine, formatPrice, inputClass } from '../../ui'

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'
const EMPTY = { title: '', description: '', startingAtPrice: '', durationMinutes: '', images: [], isActive: true }

const toRupees = (paisa) => (Number.isFinite(paisa) ? String(paisa / 100) : '')

function toPaisa(text) {
  const trimmed = String(text).trim()
  if (!trimmed) return null
  const rupees = Number(trimmed)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return Math.round(rupees * 100)
}

function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

function OfferingForm({ editing, onSaved, onCancel }) {
  // The parent keys this form by the offering being edited (or "new"), so
  // switching targets remounts it with the right starting values.
  const [form, setForm] = useState(() =>
    editing
      ? {
          title: editing.title,
          description: editing.description || '',
          startingAtPrice: toRupees(editing.startingAtPrice),
          durationMinutes: String(editing.durationMinutes),
          images: editing.images || [],
          isActive: editing.isActive,
        }
      : EMPTY,
  )
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setMessage('')

    const errors = {}
    if (form.title.trim().length < 2) errors.title = 'Use at least 2 characters'
    const price = toPaisa(form.startingAtPrice)
    if (price === null) errors.startingAtPrice = 'Enter the starting price in rupees'
    const duration = Number(form.durationMinutes)
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440) {
      errors.durationMinutes = 'Choose between 15 minutes and 24 hours'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      startingAtPrice: price,
      durationMinutes: duration,
      images: form.images,
      isActive: form.isActive,
    }

    setSaving(true)
    try {
      if (editing) await api.patch(`/services/provider/offerings/${editing._id}`, body)
      else await api.post('/services/provider/offerings', body)
      onSaved(editing ? 'Service updated.' : 'Service added.')
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Notice tone="warn">{message}</Notice>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Service name"
            id="title"
            name="title"
            value={form.title}
            onChange={onChange}
            error={fieldErrors.title}
            placeholder="e.g. Full home deep clean"
            required
          />
        </div>
        <Field
          label="Starting price (Rs)"
          id="startingAtPrice"
          name="startingAtPrice"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={form.startingAtPrice}
          onChange={onChange}
          error={fieldErrors.startingAtPrice}
          hint="A floor for customers. The final price is agreed per job."
          required
        />
        <Field
          label="Typical duration (minutes)"
          id="durationMinutes"
          name="durationMinutes"
          type="number"
          min="15"
          max="1440"
          step="15"
          inputMode="numeric"
          value={form.durationMinutes}
          onChange={onChange}
          error={fieldErrors.durationMinutes}
          hint="Between 15 minutes and 24 hours."
          required
        />
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          What is included
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={form.description}
          onChange={onChange}
          maxLength={2000}
          placeholder="What the customer gets, what they need to prepare, and anything that costs extra."
          className={`${inputClass} py-3`}
        />
      </div>

      <div>
        <p className={labelClass}>Photos</p>
        <ImageUploader
          images={form.images}
          onChange={(images) => setForm((f) => ({ ...f, images }))}
          name={form.title || 'service'}
          noun="service"
          upload={uploadProviderImage}
          max={8}
        />
      </div>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="h-4 w-4 rounded border-line accent-pine"
        />
        Show this service on my public page
      </label>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className={btnPine}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add service'}
        </button>
        {editing && (
          <button type="button" onClick={onCancel} className={btnOutline}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default function ProviderOfferings() {
  const [state, setState] = useState({ loaded: false, items: [], error: '' })
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/offerings')
      .then((res) => active && setState({ loaded: true, items: res.data.offerings, error: '' }))
      .catch((err) => active && setState({ loaded: true, items: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [reload])

  function onSaved(text) {
    setEditing(null)
    setAdding(false)
    setNotice(text)
    setReload((n) => n + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function remove(offering) {
    if (!window.confirm(`Remove “${offering.title}” from your page?`)) return
    try {
      await api.delete(`/services/provider/offerings/${offering._id}`)
      setNotice('Service removed from your page.')
      setReload((n) => n + 1)
    } catch (err) {
      setNotice('')
      setState((s) => ({ ...s, error: getErrorMessage(err) }))
    }
  }

  const formOpen = adding || Boolean(editing)
  const activeCount = state.items.filter((o) => o.isActive).length

  return (
    <>
      <PageHeader
        title="Services & prices"
        intro="The individual services customers can book. Your category is fixed; each service has its own starting price and duration."
        action={
          !formOpen && (
            <button type="button" onClick={() => setAdding(true)} className={btnPine}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add service
            </button>
          )
        }
      />
      <Notice>{!state.error && notice}</Notice>

      {formOpen ? (
        <section className="mb-8 rounded-lg border border-line bg-white p-6">
          <h2 className="mb-5 text-[15px] font-semibold text-ink">
            {editing ? `Edit ${editing.title}` : 'New service'}
          </h2>
          <OfferingForm
            key={editing?._id || 'new'}
            editing={editing}
            onSaved={onSaved}
            onCancel={() => {
              setEditing(null)
              setAdding(false)
            }}
          />
        </section>
      ) : null}

      {!state.loaded ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : state.error ? (
        <p className="text-clay">{state.error}</p>
      ) : state.items.length === 0 ? (
        !formOpen && (
          <EmptyState
            icon={Wrench}
            title="No services yet."
            message="Add what you offer — each service appears on your public page with its own starting price."
            className="rounded-lg border border-dashed border-line bg-white"
            action={
              <button type="button" onClick={() => setAdding(true)} className={btnPine}>
                Add your first service
              </button>
            }
          />
        )
      ) : (
        <>
          <p className="mb-4 text-[13px] text-muted">
            {state.items.length} {state.items.length === 1 ? 'service' : 'services'} · {activeCount} shown publicly
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            {state.items.map((offering) => (
              <li key={offering._id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <ProductImage
                  src={offering.images?.[0]}
                  name={offering.title}
                  className="size-14 shrink-0 rounded-md text-sm"
                />
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-ink">{offering.title}</p>
                    <StatusBadge value={offering.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                    <span>From {formatPrice(offering.startingAtPrice / 100)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {durationLabel(offering.durationMinutes)}
                    </span>
                  </p>
                  {offering.description && (
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{offering.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false)
                      setEditing(offering)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] font-medium text-ink transition hover:border-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(offering)}
                    aria-label={`Remove ${offering.title}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-danger/40 text-danger transition hover:border-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
