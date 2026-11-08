import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import CoordinatesField from '../../components/CoordinatesField'
import { Notice, PageHeader, Pager, selectClass, StatusBadge } from '../../components/brand/Bits'
import { usePaged } from '../../hooks/usePaged'
import { EmptyState, Skeleton } from '../../components/ui'
import { insidePolygon, parseLatLng } from '../../utils/geo'
import { btnPine } from '../../ui'

// Leaflet is only downloaded when the brand admin opens this page.
const AreaMap = lazy(() => import('../../components/nearby/AreaMap'))

const EMPTY = { name: '', blockId: '', address: '', phone: '', coords: '' }
const COORDS_ERROR = 'Enter latitude and longitude, like 31.4186, 73.0790.'

export default function Branches() {
  const [branches, setBranches] = useState(null)
  const paged = usePaged(branches, 8)
  const [blocks, setBlocks] = useState([])
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const headingRef = useRef(null)

  // The brand's city decides which blocks it may open a branch in.
  useEffect(() => {
    let active = true
    api
      .get('/brands/me')
      .then((res) => api.get('/blocks', { params: { cityId: res.data.brand.cityId, isActive: true } }))
      .then((res) => active && setBlocks(res.data.blocks))
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api
      .get('/brand/branches')
      .then((res) => active && setBranches(res.data.branches))
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [reload])

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const selectedBlock = blocks.find((b) => b._id === form.blockId) || null
  const pin = form.coords.trim() ? parseLatLng(form.coords) : null
  const outside = Boolean(pin && selectedBlock?.polygon && !insidePolygon(pin, selectedBlock.polygon))
  const zones = useMemo(() => (selectedBlock ? [selectedBlock] : []), [selectedBlock])
  const selectedIds = useMemo(() => (form.blockId ? [form.blockId] : []), [form.blockId])

  function startEdit(branch) {
    setEditingId(branch._id)
    setFieldErrors({})
    setForm({
      name: branch.name,
      blockId: branch.blockId,
      address: branch.address || '',
      phone: branch.phone || '',
      coords: `${branch.latitude}, ${branch.longitude}`,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
  }

  function reset() {
    setEditingId(null)
    setFieldErrors({})
    setForm(EMPTY)
  }

  // Changing the block drops the old pin (it is probably outside the new one);
  // blank means "use the block centre".
  function onBlockChange(e) {
    const blockId = e.target.value
    setForm((f) => ({ ...f, blockId, coords: blockId === f.blockId ? f.coords : '' }))
  }

  async function run(action, success) {
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      await action()
      setMessage({ text: success, tone: 'ok' })
      setReload((n) => n + 1)
      return true
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    const hasCoords = form.coords.trim() !== ''
    const point = hasCoords ? parseLatLng(form.coords) : null
    if (hasCoords && !point) {
      setFieldErrors({ coords: COORDS_ERROR })
      return
    }
    const body = {
      name: form.name,
      blockId: form.blockId,
      address: form.address,
      phone: form.phone,
      ...(point && { latitude: point.lat, longitude: point.lng }),
    }
    const ok = editingId
      ? await run(() => api.patch(`/brand/branches/${editingId}`, body), 'Branch updated.')
      : await run(() => api.post('/brand/branches', body), 'Branch added.')
    if (ok) reset()
  }

  const setActive = (branch, isActive) =>
    run(
      () => api.patch(`/brand/branches/${branch._id}`, { isActive }),
      isActive ? 'Branch reactivated.' : 'Branch deactivated. Shoppers will no longer find it.',
    )

  return (
    <>
      <PageHeader
        title="Branches"
        intro="Each shop of your brand, in the block where it is. Shoppers nearby find your brand through these."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <form onSubmit={onSubmit} noValidate className="mb-8 rounded-card border border-line-warm bg-paper-warm p-5">
        <h2 ref={headingRef} tabIndex={-1} className="mb-4 font-display text-lg font-semibold tracking-tight text-ink outline-none">
          {editingId ? 'Edit branch' : 'Add a branch'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch name" id="br-name" name="name" value={form.name} onChange={set('name')} error={fieldErrors.name} placeholder="e.g. Main Bazaar shop" required />
          <div>
            <label htmlFor="br-block" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
              Block
            </label>
            <select id="br-block" value={form.blockId} onChange={onBlockChange} className={`${selectClass} h-11 w-full`} required>
              <option value="">Choose a block…</option>
              {blocks.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors.blockId && <p className="mt-1.5 text-xs text-clay">{fieldErrors.blockId}</p>}
            {blocks.length === 0 && !loadError && <p className="mt-1.5 text-xs text-ink/55">No blocks are set up for your city yet. Contact CityCart support.</p>}
          </div>
          <Field label="Address" id="br-address" name="address" value={form.address} onChange={set('address')} error={fieldErrors.address} placeholder="Street, landmark" />
          <Field label="Phone" id="br-phone" name="phone" value={form.phone} onChange={set('phone')} error={fieldErrors.phone} type="tel" />
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">Shop location on the map</p>
          {form.blockId ? (
            <>
              <p className="mb-2 text-[12.5px] text-ink/55">
                {selectedBlock?.name} is highlighted. Tap inside it to place the shop’s pin — the pin decides the distances shoppers see.
              </p>
              <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-card" />}>
                <AreaMap
                  key={form.blockId}
                  zones={zones}
                  selectedIds={selectedIds}
                  pin={pin}
                  height={320}
                  onPick={(lat, lng) => setForm((f) => ({ ...f, coords: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }))}
                  label={`Map for placing the ${selectedBlock?.name || ''} branch`}
                />
              </Suspense>
              {outside ? (
                <p className="mt-2 text-[12.5px] text-clay" aria-live="polite">
                  This pin is outside {selectedBlock.name}. Tap inside the highlighted outline.
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-tile bg-sand/50 px-3.5 py-3 text-[13px] text-ink/55">Choose a block to pin the shop on the map.</p>
          )}
        </div>

        <div className="mt-4">
          <CoordinatesField
            id="br-coords"
            label="Exact location (optional)"
            value={form.coords}
            onChange={(coords) => setForm((f) => ({ ...f, coords }))}
            error={fieldErrors.coords || fieldErrors.latitude}
            hint="Tap the map above, or type the coordinates. Leave empty to use the middle of the block."
          />
          {pin && selectedBlock ? (
            <button type="button" onClick={() => setForm((f) => ({ ...f, coords: '' }))} className="mt-1 text-[12.5px] font-medium text-ink/70 transition hover:text-ink">
              Use the middle of {selectedBlock.name}
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !form.name.trim() || !form.blockId} className={btnPine}>
            {editingId ? 'Save changes' : 'Add branch'}
          </button>
          {editingId && (
            <button type="button" onClick={reset} className="inline-flex h-11 items-center rounded-tile border border-line-warm bg-paper-warm px-5 text-[13px] font-medium text-ink transition hover:border-ink">
              Cancel
            </button>
          )}
        </div>
      </form>

      {loadError ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{loadError}</p>
      ) : !branches ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-card" />
          ))}
        </div>
      ) : branches.length === 0 ? (
        <EmptyState icon={MapPin} title="No branches yet." message="Add your first shop above so nearby shoppers can find your brand." className="rounded-card border border-dashed border-line-warm bg-paper-warm" />
      ) : (
        <>
          <ul className="divide-y divide-line-warm rounded-card border border-line-warm bg-paper-warm">
          {paged.items.map((b) => (
            <li key={b._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{b.name}</span>
                <span className="block text-sm text-ink/55">{[b.blockName, b.address].filter(Boolean).join(' · ')}</span>
                {b.phone && <span className="block text-sm text-ink/55">{b.phone}</span>}
              </span>
              <span className="flex items-center gap-2.5 text-[12.5px] font-medium">
                <StatusBadge value={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
                <button type="button" onClick={() => startEdit(b)} aria-label={`Edit ${b.name}`} className="rounded-tile border border-line-warm px-3 py-1.5 text-ink transition hover:border-ink">
                  Edit
                </button>
                {b.isActive ? (
                  <button type="button" disabled={busy} onClick={() => setActive(b, false)} aria-label={`Deactivate ${b.name}`} className="rounded-tile border border-clay/40 px-3 py-1.5 text-clay transition hover:border-clay">
                    Deactivate
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setActive(b, true)} aria-label={`Reactivate ${b.name}`} className="rounded-tile border border-forest px-3 py-1.5 text-forest transition hover:bg-forest hover:text-cream">
                    Reactivate
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
          <Pager pagination={paged.pagination} onPage={paged.setPage} />
        </>
      )}
    </>
  )
}
