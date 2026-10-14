import { useState } from 'react'
import { isRadius, MAX_RADIUS_KM, MIN_RADIUS_KM } from '../../utils/range'
import { useNearby } from '../../hooks/useNearby'

const PRESETS = [
  ['block', 'This block'],
  ['2', '2 km'],
  ['5', '5 km'],
  ['10', '10 km'],
  ['20', '20 km'],
  ['city', 'Whole city'],
]

const pill = (active) =>
  `h-9 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition ${
    active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink/75 hover:border-ink hover:text-ink'
  }`

// How far to search: own block, a preset radius, a custom number of km, or the whole city.
export default function RangeSelector({ onChange }) {
  const { range, setRange } = useNearby()
  const choose = (value) => (onChange ? onChange(value) : setRange(value))
  const isPreset = PRESETS.some(([value]) => value === range)
  const custom = isRadius(range) && !isPreset ? range : ''

  // The draft only lives while typing; a saved custom value shows from `range`.
  const [draft, setDraft] = useState(null)
  const shown = draft ?? custom

  function apply() {
    if (draft === null) return
    const km = Number(draft)
    if (draft.trim() && km >= MIN_RADIUS_KM && km <= MAX_RADIUS_KM) choose(String(km))
    setDraft(null)
  }

  return (
    <div role="radiogroup" aria-label="Search range" className="flex flex-wrap items-center gap-2">
      {PRESETS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={range === value}
          onClick={() => {
            setDraft(null)
            choose(value)
          }}
          className={pill(range === value)}
        >
          {label}
        </button>
      ))}
      <label className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${custom ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink/75'}`}>
        <span className="sr-only">Custom distance in kilometres</span>
        <input
          type="number"
          inputMode="decimal"
          min={MIN_RADIUS_KM}
          max={MAX_RADIUS_KM}
          step="0.5"
          placeholder="Custom"
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="w-14 bg-transparent text-center outline-none placeholder:text-muted/70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        km
      </label>
    </div>
  )
}
