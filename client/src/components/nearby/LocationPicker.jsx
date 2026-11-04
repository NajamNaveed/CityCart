import { lazy, Suspense, useMemo, useState } from 'react'
import { Check, LocateFixed, MapPin, Search } from 'lucide-react'
import { Modal, Skeleton, Spinner } from '../ui'
import { useCity } from '../../hooks/useCity'
import { useNearby } from '../../hooks/useNearby'
import { formatDistance } from '../../utils/geo'
import { btnDark, btnOutline, inputClass } from '../../ui'

// Leaflet is only downloaded when the shopper opens the map.
const AreaMap = lazy(() => import('./AreaMap'))

const MESSAGES = {
  denied: 'Location is blocked for this site. Allow it in your browser settings, drop a pin on the map, or choose your area below.',
  outside: "We don't serve this spot yet. Choose a city and area below.",
  nodevice: "This device can't share its location. Drop a pin on the map, or choose your area below.",
  error: "We couldn't find your location. Drop a pin on the map, or choose your area below.",
}

const row = (active) =>
  `flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
    active ? 'bg-paper font-semibold text-ink' : 'text-ink/70 hover:bg-paper hover:text-ink'
  }`

const chip = (on) =>
  `inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition ${
    on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink/75 hover:border-ink'
  }`

/** Blocks to tick: where the shopper is standing holds several, or sits between blocks. */
function BlockChoices({ title, hint, options, blockIds, onToggle }) {
  return (
    <div className="mt-3 rounded-md border border-line bg-paper px-3.5 py-3">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={title}>
        {options.map((b) => {
          const on = blockIds.includes(b._id)
          return (
            <button key={b._id} type="button" aria-pressed={on} onClick={() => onToggle(b._id)} className={chip(on)}>
              {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {b.name}
              {typeof b.distanceKm === 'number' && b.distanceKm > 0 && <span className="text-[11.5px] opacity-75">{formatDistance(b.distanceKm)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function LocationPicker() {
  const { cities, cityId, setCityId } = useCity()
  const {
    blocks, blocksReady, blockIds, coords, pinned, choices, status, pickerOpen, closePicker, detect, setPin,
    toggleBlock, toggleManualBlock, clearLocation,
  } = useNearby()
  const [search, setSearch] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  const visibleBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? blocks.filter((b) => b.name.toLowerCase().includes(needle)) : blocks
  }, [blocks, search])

  async function onDetect() {
    const result = await detect()
    if (result === 'found') closePicker() // one block: nothing left to choose
  }

  const overlapping = choices.containing.length > 1
  const between = status === 'border' || (blockIds.length === 0 && choices.nearest.length > 0)

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

      {overlapping && (
        <BlockChoices
          title={`This spot is in ${choices.containing.length} blocks`}
          hint="Shop in one or in all of them."
          options={choices.containing}
          blockIds={blockIds}
          onToggle={toggleBlock}
        />
      )}
      {between && (
        <BlockChoices
          title="This spot is between blocks"
          hint="Pick the blocks you want to shop in."
          options={choices.nearest}
          blockIds={blockIds}
          onToggle={toggleBlock}
        />
      )}

      <div className="mt-4">
        <button type="button" onClick={() => setMapOpen((v) => !v)} aria-expanded={mapOpen} className={`${btnOutline} w-full`}>
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {mapOpen ? 'Hide the map' : 'Pick a spot on the map'}
        </button>
        {mapOpen && (
          <div className="mt-3">
            <p className="mb-2 text-[12.5px] text-muted">
              Tap where you want to shop or have your order delivered, for example another part of town. Shaded areas are where we deliver.
            </p>
            {!cityId || !blocksReady ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-lg" />}>
                <AreaMap zones={blocks} selectedIds={blockIds} pin={coords && pinned ? coords : null} onPick={setPin} />
              </Suspense>
            )}
          </div>
        )}
      </div>

      <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Or choose manually</p>

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
            <button type="button" onClick={clearLocation} className={row(blockIds.length === 0)}>
              Whole city (no specific area)
              {blockIds.length === 0 && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
            </button>
            {visibleBlocks.map((b) => {
              const on = blockIds.includes(b._id)
              return (
                <button key={b._id} type="button" aria-pressed={on} onClick={() => toggleManualBlock(b._id)} className={row(on)}>
                  <span className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    {b.name}
                  </span>
                  {on && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
                </button>
              )
            })}
            {visibleBlocks.length === 0 && <p className="px-3 py-2 text-[13px] text-muted">No area matches “{search}”.</p>}
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">You can choose more than one area.</p>
        </>
      )}

      <button type="button" onClick={closePicker} className={`${btnDark} mt-4 w-full`}>
        Done
      </button>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Your location is saved only on this device. We use it to find shops near you and don’t store it on our servers.
      </p>
    </Modal>
  )
}
