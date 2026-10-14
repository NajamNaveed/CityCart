import { useMemo, useState } from 'react'
import { Check, LocateFixed, MapPin, Search } from 'lucide-react'
import { Modal, Spinner } from '../ui'
import { useCity } from '../../hooks/useCity'
import { useNearby } from '../../hooks/useNearby'
import { btnDark, inputClass } from '../../ui'

const MESSAGES = {
  denied: 'Location is blocked for this site. Allow it in your browser settings, or choose your area below.',
  outside: "We don't serve your current location yet. Choose a city and area below.",
  nodevice: "This device can't share its location. Choose your area below.",
  error: "We couldn't find your location. Choose your area below.",
}

const row = (active) =>
  `flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
    active ? 'bg-paper font-semibold text-ink' : 'text-ink/70 hover:bg-paper hover:text-ink'
  }`

export default function LocationPicker() {
  const { cities, cityId, setCityId } = useCity()
  const { blocks, blocksReady, blockId, status, pickerOpen, closePicker, detect, chooseBlock, clearLocation } = useNearby()
  const [search, setSearch] = useState('')

  const visibleBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? blocks.filter((b) => b.name.toLowerCase().includes(needle)) : blocks
  }, [blocks, search])

  async function onDetect() {
    const result = await detect()
    if (result === 'found') closePicker()
  }

  return (
    <Modal open={pickerOpen} onClose={closePicker} title="Where are you shopping?" maxWidth="max-w-lg">
      <button type="button" onClick={onDetect} disabled={status === 'detecting'} className={`${btnDark} w-full`}>
        <LocateFixed className="h-4 w-4" aria-hidden="true" />
        Use my current location
      </button>
      <div className="mt-2 min-h-5 text-[12.5px]" aria-live="polite">
        {status === 'detecting' && <Spinner label="Finding your area…" />}
        {MESSAGES[status] && <p className="text-clay">{MESSAGES[status]}</p>}
      </div>

      <p className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Or choose manually</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {cities.map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => setCityId(c._id)}
            aria-pressed={cityId === c._id}
            className={`h-9 rounded-full border px-3.5 text-[13px] font-medium transition ${
              cityId === c._id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink/75 hover:border-ink'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {!cityId ? (
        <p className="rounded-md bg-paper px-3 py-3 text-[13px] text-muted">Pick a city to see its areas.</p>
      ) : !blocksReady ? (
        <div className="py-4">
          <Spinner label="Loading areas…" />
        </div>
      ) : blocks.length === 0 ? (
        <p className="rounded-md bg-paper px-3 py-3 text-[13px] text-muted">No areas have been set up for this city yet.</p>
      ) : (
        <>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <label htmlFor="block-search" className="sr-only">
              Search areas
            </label>
            <input
              id="block-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your area…"
              className={`h-10 pl-9 ${inputClass}`}
            />
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            <button type="button" onClick={clearLocation} className={row(!blockId)}>
              Whole city (no specific area)
              {!blockId && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
            </button>
            {visibleBlocks.map((b) => (
              <button
                key={b._id}
                type="button"
                onClick={() => {
                  chooseBlock(b._id)
                  closePicker()
                }}
                className={row(blockId === b._id)}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  {b.name}
                </span>
                {blockId === b._id && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
              </button>
            ))}
            {visibleBlocks.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">No area matches “{search}”.</p>}
          </div>
        </>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        Your location is saved only on this device. We use it to find shops near you and don’t store it on our servers.
      </p>
    </Modal>
  )
}
