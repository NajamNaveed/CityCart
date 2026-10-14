import { useEffect, useState } from 'react'
import { MapPinned } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import CoordinatesField from '../../components/CoordinatesField'
import { Notice, PageHeader, Pager, selectClass, StatusBadge } from '../../components/brand/Bits'
import { usePaged } from '../../hooks/usePaged'
import { EmptyState, Skeleton } from '../../components/ui'
import { parseLatLng } from '../../utils/geo'
import { btnDark, inputClass } from '../../ui'

const EMPTY = { name: '', coords: '' }
const COORDS_ERROR = 'Enter latitude and longitude, like 31.4186, 73.0790.'

export default function Blocks() {
  const [cities, setCities] = useState(null)
  const [cityId, setCityId] = useState('')
  const [blocks, setBlocks] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [editing, setEditing] = useState(null) // { id, name, coords }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', tone: 'ok' })

  useEffect(() => {
    let active = true
    api
      .get('/cities')
      .then((res) => {
        if (!active) return
        setCities(res.data.cities)
        setCityId((current) => current || res.data.cities[0]?._id || '')
      })
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!cityId) return undefined
    let active = true
    api
      .get('/blocks', { params: { cityId } })
      .then((res) => active && setBlocks({ cityId, list: res.data.blocks }))
      .catch((err) => active && setLoadError(getErrorMessage(err)))
    return () => {
      active = false
    }
  }, [cityId, reload])

  const list = blocks && blocks.cityId === cityId ? blocks.list : null
  const paged = usePaged(list, 10)

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

  async function onAdd(e) {
    e.preventDefault()
    setFieldErrors({})
    const point = parseLatLng(form.coords)
    if (!point) {
      setFieldErrors({ coords: COORDS_ERROR })
      return
    }
    const ok = await run(
      () => api.post('/blocks', { cityId, name: form.name, latitude: point.lat, longitude: point.lng }),
      'Block added.',
    )
    if (ok) setForm(EMPTY)
  }

  async function onSave(e) {
    e.preventDefault()
    const point = parseLatLng(editing.coords)
    if (!point) {
      setMessage({ text: COORDS_ERROR, tone: 'warn' })
      return
    }
    const ok = await run(
      () => api.patch(`/blocks/${editing.id}`, { name: editing.name, latitude: point.lat, longitude: point.lng }),
      'Block updated.',
    )
    if (ok) setEditing(null)
  }

  const setActive = (block, isActive) =>
    run(
      () => api.patch(`/blocks/${block._id}`, { isActive }),
      isActive ? 'Block reactivated.' : 'Block deactivated. It no longer appears for shoppers or brands.',
    )

  return (
    <>
      <PageHeader
        title="Blocks"
        intro="The neighbourhoods inside each city. Shoppers are matched to the nearest block, and brands place their branches in one."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      {loadError ? (
        <p className="text-clay">{loadError}</p>
      ) : !cities ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : cities.length === 0 ? (
        <EmptyState icon={MapPinned} title="Add a city first." message="Blocks belong to a city. Create one on the Cities page." className="rounded-lg border border-dashed border-line bg-white" />
      ) : (
        <>
          <div className="mb-5 max-w-xs">
            <label htmlFor="block-city" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
              City
            </label>
            <select id="block-city" value={cityId} onChange={(e) => setCityId(e.target.value)} className={`${selectClass} w-full`}>
              {cities.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={onAdd} noValidate className="mb-8 grid gap-4 rounded-lg border border-line bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
            <Field label="New block" id="b-name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fieldErrors.name} required />
            <CoordinatesField
              id="b-coords"
              label="Centre point"
              value={form.coords}
              onChange={(coords) => setForm({ ...form, coords })}
              error={fieldErrors.coords || fieldErrors.latitude}
              hint="In Google Maps, right-click the middle of the block and click the coordinates to copy them."
              required
            />
            <button type="submit" disabled={busy || !form.name.trim() || !form.coords.trim()} className={`${btnDark} h-11 sm:mt-[26px]`}>
              Add
            </button>
          </form>

          {!list ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={MapPinned} title="No blocks yet." message="Add the first one above. Shoppers and brands pick from these." className="rounded-lg border border-dashed border-line bg-white" />
          ) : (
            <>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
              {paged.items.map((b) => (
                <li key={b._id} className="px-5 py-4">
                  {editing?.id === b._id ? (
                    <form onSubmit={onSave} className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1 basis-48">
                        <label htmlFor="edit-name" className="sr-only">
                          Block name
                        </label>
                        <input id="edit-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`h-10 ${inputClass}`} required />
                      </div>
                      <div className="min-w-0 flex-1 basis-48">
                        <label htmlFor="edit-coords" className="sr-only">
                          Centre point
                        </label>
                        <input id="edit-coords" value={editing.coords} onChange={(e) => setEditing({ ...editing, coords: e.target.value })} placeholder="31.4186, 73.0790" className={`h-10 ${inputClass}`} required />
                      </div>
                      <button type="submit" disabled={busy || !editing.name.trim()} className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-[12.5px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-50">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-4 text-[12.5px] font-medium text-ink transition hover:border-ink">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="font-medium text-ink">{b.name}</span>
                        <span className="ml-3 text-sm text-muted">
                          {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5 text-[12.5px] font-medium">
                        <StatusBadge value={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        <button
                          type="button"
                          onClick={() => setEditing({ id: b._id, name: b.name, coords: `${b.latitude}, ${b.longitude}` })}
                          className="rounded-md border border-line px-3 py-1.5 text-ink transition hover:border-ink"
                        >
                          Edit
                        </button>
                        {b.isActive ? (
                          <button type="button" disabled={busy} onClick={() => setActive(b, false)} className="rounded-md border border-danger/40 px-3 py-1.5 text-danger transition hover:border-danger">
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => setActive(b, true)} className="rounded-md border border-pine px-3 py-1.5 text-pine transition hover:bg-pine hover:text-white">
                            Reactivate
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          <Pager pagination={paged.pagination} onPage={paged.setPage} />
        </>
          )}
        </>
      )}
    </>
  )
}
