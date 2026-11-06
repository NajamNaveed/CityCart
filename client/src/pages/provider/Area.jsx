import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import { Notice, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { insidePolygon, latLngOfGeoPoint, parseLatLng } from '../../utils/geo'
import { btnPine, formatDateTime, inputClass } from '../../ui'

const AreaMap = lazy(() => import('../../components/nearby/AreaMap'))

const labelClass = 'mb-1.5 block text-[12px] font-medium uppercase tracking-[0.1em] text-muted'

// Mirrors the server's UTC calendar-month rule so the form can explain the
// limit before a save is refused.
function changedThisMonth(iso) {
  if (!iso) return false
  const changed = new Date(iso)
  const now = new Date()
  return changed.getUTCFullYear() === now.getUTCFullYear() && changed.getUTCMonth() === now.getUTCMonth()
}

export default function ProviderArea() {
  const [state, setState] = useState({ loaded: false, provider: null, error: '' })
  const [blocks, setBlocks] = useState([])
  const [blocksError, setBlocksError] = useState('')
  const [blockId, setBlockId] = useState('')
  const [coords, setCoords] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState({ text: '', tone: 'ok' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/me')
      .then((res) => {
        if (!active) return
        const provider = res.data.provider
        const current = latLngOfGeoPoint(provider.location)
        setState({ loaded: true, provider, error: '' })
        setBlockId(provider.blockId || '')
        setCoords(current ? `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}` : '')
      })
      .catch((err) => active && setState({ loaded: true, provider: null, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [])

  const cityId = state.provider?.cityId || ''

  useEffect(() => {
    if (!cityId) return undefined
    let active = true
    api
      .get('/blocks', { params: { cityId, isActive: true } })
      .then((res) => {
        if (!active) return
        setBlocks(res.data.blocks || [])
        setBlocksError('')
      })
      .catch((err) => {
        if (!active) return
        setBlocks([])
        setBlocksError(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [cityId])

  const selectedBlock = blocks.find((b) => b._id === blockId) || null
  const pin = coords.trim() ? parseLatLng(coords) : null
  const outside = Boolean(pin && selectedBlock?.polygon && !insidePolygon(pin, selectedBlock.polygon))
  const zones = useMemo(() => (selectedBlock ? [selectedBlock] : []), [selectedBlock])
  const selectedIds = useMemo(() => (blockId ? [blockId] : []), [blockId])
  const movingBlock = Boolean(state.provider && blockId && blockId !== state.provider.blockId)
  const blockChangeLocked = Boolean(movingBlock && changedThisMonth(state.provider?.blockChangedAt))

  async function onSubmit(e) {
    e.preventDefault()
    setFieldErrors({})
    setMessage({ text: '', tone: 'ok' })

    if (!blockId) {
      setFieldErrors({ blockId: 'Choose your area' })
      return
    }
    if (!pin) {
      setFieldErrors({ latitude: 'Tap the map to place your pin inside the block.' })
      return
    }
    if (outside) {
      setFieldErrors({ latitude: `Place the pin inside ${selectedBlock.name}.` })
      return
    }

    setSaving(true)
    try {
      const res = await api.patch('/services/provider/block', {
        blockId,
        latitude: pin.lat,
        longitude: pin.lng,
      })
      setState((s) => ({ ...s, provider: res.data.provider }))
      setMessage({ text: 'Service area updated.', tone: 'ok' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setSaving(false)
    }
  }

  if (!state.loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[360px] w-full rounded-lg" />
      </div>
    )
  }

  if (!state.provider) {
    return (
      <>
        <PageHeader title="Service area" />
        <p className="text-clay">{state.error}</p>
      </>
    )
  }

  const provider = state.provider

  return (
    <>
      <PageHeader
        title="Service area"
        intro="Where customers can find you. Move your pin freely inside your block; a different block is allowed once a month."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="rounded-lg border border-line bg-white p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">City</dt>
              <dd className="mt-1 font-medium text-ink">{provider.city?.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Current block</dt>
              <dd className="mt-1 font-medium text-ink">{provider.block?.name || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Last block change</dt>
              <dd className="mt-1 text-ink">{provider.blockChangedAt ? formatDateTime(provider.blockChangedAt) : 'Never'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">City changes</dt>
              <dd className="mt-1 text-muted">Not available — the city is fixed at signup.</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-line bg-white p-6">
          <div className="max-w-md">
            <label htmlFor="blockId" className={labelClass}>
              Area / block
            </label>
            <select
              id="blockId"
              value={blockId}
              onChange={(e) => {
                // A pin in the old block is not valid in the new one.
                setBlockId(e.target.value)
                setCoords('')
              }}
              className={`h-11 ${inputClass} ${fieldErrors.blockId ? 'border-clay' : ''}`}
              required
            >
              <option value="">Choose your area</option>
              {blocks.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fieldErrors.blockId ? (
              <p className="mt-1.5 text-xs text-clay">{fieldErrors.blockId}</p>
            ) : blocksError ? (
              <p className="mt-1.5 text-xs text-clay">{blocksError}</p>
            ) : blockChangeLocked ? (
              <p className="mt-1.5 text-xs text-clay">
                You already changed your block this month. Choose {state.provider.block?.name || 'your current block'}{' '}
                to move your pin, or come back next month to switch.
              </p>
            ) : movingBlock ? (
              <p className="mt-1.5 text-xs text-ink">
                This is a block change. You can change the block again next calendar month.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted">Moving the pin inside the same block is unlimited.</p>
            )}
          </div>

          <div className="mt-6">
            <p className={labelClass}>Pin</p>
            {selectedBlock ? (
              <>
                <p className="mb-2 text-[13px] text-muted">
                  {selectedBlock.name} is highlighted. Tap inside it to place your pin. Customers only see your block
                  until you accept a booking.
                </p>
                <Suspense fallback={<Skeleton className="h-[320px] w-full rounded-lg" />}>
                  <AreaMap
                    key={selectedBlock._id}
                    zones={zones}
                    selectedIds={selectedIds}
                    pin={pin}
                    height={320}
                    onPick={(lat, lng) => setCoords(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)}
                    label={`Map for placing the ${selectedBlock.name} service pin`}
                  />
                </Suspense>
                {outside ? (
                  <p className="mt-2 text-xs text-clay" aria-live="polite">
                    This pin is outside {selectedBlock.name}. Tap inside the highlighted outline.
                  </p>
                ) : fieldErrors.latitude ? (
                  <p className="mt-2 text-xs text-clay">{fieldErrors.latitude}</p>
                ) : null}
              </>
            ) : (
              <p className="rounded-md bg-paper px-3.5 py-3 text-[13px] text-muted">
                Choose an area to place your pin on the map.
              </p>
            )}
          </div>
        </div>

        <button type="submit" disabled={saving || blockChangeLocked || !state.provider} className={btnPine}>
          {saving ? 'Saving…' : 'Save service area'}
        </button>
      </form>
    </>
  )
}
