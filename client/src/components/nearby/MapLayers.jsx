import { ChevronDown, MapPin } from 'lucide-react'

const STATE_LABEL = { all: 'All', mine: 'Mine', off: 'Off' }
const NEXT_LABEL = { all: 'only mine', mine: 'off', off: 'everything' }

// Map overlay shared by shops and services: a city picker that only moves the
// view, plus one button per layer that cycles everything -> mine -> hidden.
export default function MapLayers({ cities = [], cityId, onCityChange, layers = [], children }) {
  return (
    <div className="absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2">
      {cities.length > 0 && (
        <label className="relative inline-flex h-9 items-center rounded-tile border border-line-warm bg-paper-warm/95 pl-8 pr-8 shadow-sm backdrop-blur">
          <span className="sr-only">City shown on the map</span>
          <MapPin className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-clay" aria-hidden="true" />
          <select
            value={cityId}
            onChange={(event) => onCityChange(event.target.value)}
            title="Selecting a city moves the map, not your saved location"
            className="h-full max-w-[9.5rem] cursor-pointer appearance-none overflow-hidden text-ellipsis whitespace-nowrap bg-transparent text-[11.5px] font-medium text-ink outline-none"
          >
            {!cityId && <option value="">Choose a city</option>}
            {cities.map((city) => (
              <option key={city._id} value={city._id}>
                {city.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/45"
            aria-hidden="true"
          />
        </label>
      )}

      <div className="flex overflow-hidden rounded-tile border border-line-warm bg-paper-warm/95 text-[11.5px] font-medium shadow-sm backdrop-blur">
        {layers.map(({ key, label, mineLabel, icon: Icon, state, onCycle }, index) => (
          <button
            key={key}
            type="button"
            aria-pressed={state !== 'off'}
            aria-label={`${label}: showing ${state === 'mine' ? (mineLabel || 'mine') : STATE_LABEL[state]}. Click to show ${NEXT_LABEL[state]}.`}
            title={`Showing ${state === 'mine' ? (mineLabel || 'mine') : STATE_LABEL[state]} · click for ${NEXT_LABEL[state]}`}
            onClick={onCycle}
            className={`inline-flex h-9 items-center gap-1.5 px-3 transition ${
              index > 0 ? 'border-l border-line-warm' : ''
            } ${state === 'off' ? 'text-ink/40 hover:text-ink/70' : 'bg-noir text-cream'}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
            <span
              className={`rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] ${
                state === 'off' ? 'bg-ink/10 text-ink/50' : 'bg-cream/20 text-cream/90'
              }`}
            >
              {STATE_LABEL[state]}
            </span>
          </button>
        ))}
      </div>

      {children}
    </div>
  )
}
