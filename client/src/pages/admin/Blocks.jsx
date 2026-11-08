import { useEffect, useMemo, useState } from 'react'
import { MapPinned } from 'lucide-react'
import api, { getErrorMessage, getFieldErrors } from '../../services/api'
import Field from '../../components/Field'
import ZoneEditor from '../../components/admin/ZoneEditor'
import { Notice, PageHeader, Pager, selectClass, StatusBadge } from '../../components/brand/Bits'
import { usePaged } from '../../hooks/usePaged'
import useReadOnly from '../../hooks/useReadOnly'
import { EmptyState, Skeleton } from '../../components/ui'
import { btnDark } from '../../ui'

export default function Blocks() {
  const readOnly = useReadOnly()
  const [cities, setCities] = useState(null)
  const [cityId, setCityId] = useState('')
  const [blocks, setBlocks] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})
  // The block being drawn: { id: null for a new block, name, ring: [[lat, lng], ...] }
  const [draft, setDraft] = useState(null)
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
  // The other active blocks, drawn as grey outlines while one is being edited.
  const draftId = draft?.id
  const others = useMemo(() => (list || []).filter((b) => b._id !== draftId && b.isActive), [list, draftId])

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

  // What the admin should know after saving a zone: overlaps are fine but worth seeing,
  // and shops that fall in no block can't be found by area.
  function describeSaved(block, verb) {
    const parts = [`Block ${verb}.`]
    if (block.overlaps?.length) {
      parts.push(`It overlaps ${block.overlaps.map((o) => o.name).join(', ')}. Shops inside an overlap appear in both blocks.`)
    }
    return {
      text: parts.join(' '),
      warn: block.branchesWithoutBlock > 0
        ? ` ${block.branchesWithoutBlock} shop${block.branchesWithoutBlock === 1 ? ' is' : 's are'} now in no block. Brands should move their pin inside a block.`
        : '',
    }
  }

  async function onSave(e) {
    e.preventDefault()
    setFieldErrors({})
    setBusy(true)
    setMessage({ text: '', tone: 'ok' })
    try {
      const body = { name: draft.name, polygon: draft.ring }
      const res = draft.id
        ? await api.patch(`/blocks/${draft.id}`, body)
        : await api.post('/blocks', { ...body, cityId })
      const { text, warn } = describeSaved(res.data.block, draft.id ? 'updated' : 'added')
      setMessage({ text: text + warn, tone: warn ? 'warn' : 'ok' })
      setDraft(null)
      setReload((n) => n + 1)
    } catch (err) {
      setFieldErrors(getFieldErrors(err))
      setMessage({ text: getErrorMessage(err), tone: 'warn' })
    } finally {
      setBusy(false)
    }
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
        intro="The neighbourhoods inside each city, drawn as zones on the map. Zones may overlap: a shop inside an overlap belongs to both blocks. Brands place their branches inside a block."
      />
      <Notice tone={message.tone}>{message.text}</Notice>

      {loadError ? (
        <p role="alert" className="rounded-tile border border-clay/20 bg-clay/10 px-3.5 py-2.5 text-sm text-clay">{loadError}</p>
      ) : !cities ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : cities.length === 0 ? (
        <EmptyState icon={MapPinned} title="Add a city first." message="Blocks belong to a city. Create one on the Cities page." className="rounded-card border border-dashed border-line-warm bg-paper-warm" />
      ) : (
        <>
          <div className="mb-5 max-w-xs">
            <label htmlFor="block-city" className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink/55">
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

          {draft ? (
            <form onSubmit={onSave} noValidate className="mb-8 space-y-4 rounded-card border border-line-warm bg-paper-warm p-5">
              <p className="font-medium text-ink">{draft.id ? `Edit ${draft.name || 'block'}` : 'Add a block'}</p>
              <div className="max-w-sm">
                <Field label="Block name" id="b-name" name="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} error={fieldErrors.name} required />
              </div>
              <ZoneEditor ring={draft.ring} onChange={(ring) => setDraft((d) => ({ ...d, ring }))} others={others} />
              {(fieldErrors.polygon || fieldErrors.latitude) && <p className="text-sm text-clay">{fieldErrors.polygon || fieldErrors.latitude}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={busy || readOnly || !draft.name.trim() || draft.ring.length < 3} className={btnDark}>
                  {busy ? 'Saving…' : 'Save block'}
                </button>
                <button type="button" onClick={() => setDraft(null)} className="inline-flex h-11 items-center rounded-tile border border-line-warm bg-paper-warm px-5 text-[13px] font-medium text-ink transition hover:border-ink">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" disabled={readOnly} onClick={() => setDraft({ id: null, name: '', ring: [] })} className={`${btnDark} mb-8`}>
              Add a block
            </button>
          )}

          {!list ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-card" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState icon={MapPinned} title="No blocks yet." message="Add the first one above. Shoppers and brands pick from these." className="rounded-card border border-dashed border-line-warm bg-paper-warm" />
          ) : (
            <>
          <ul className="divide-y divide-line-warm rounded-card border border-line-warm bg-paper-warm">
              {paged.items.map((b) => (
                <li key={b._id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="font-medium text-ink">{b.name}</span>
                        <span className="ml-3 text-sm text-ink/55">
                          {b.polygon ? `${b.polygon.length} corners` : 'No outline yet. Edit it to draw one.'}
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5 text-[12.5px] font-medium">
                        <StatusBadge value={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            setMessage({ text: '', tone: 'ok' })
                            setDraft({ id: b._id, name: b.name, ring: b.polygon || [] })
                          }}
                          className="rounded-tile border border-line-warm px-3 py-1.5 text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Edit
                        </button>
                        {b.isActive ? (
                          <button type="button" disabled={busy || readOnly} onClick={() => setActive(b, false)} className="rounded-tile border border-clay/40 px-3 py-1.5 text-clay transition hover:border-clay disabled:cursor-not-allowed disabled:opacity-40">
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" disabled={busy || readOnly} onClick={() => setActive(b, true)} className="rounded-tile border border-forest px-3 py-1.5 text-forest transition hover:bg-forest hover:text-cream disabled:cursor-not-allowed disabled:opacity-40">
                            Reactivate
                          </button>
                        )}
                      </span>
                    </div>
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
