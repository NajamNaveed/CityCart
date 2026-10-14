import { useState } from 'react'
import { LocateFixed } from 'lucide-react'
import Field from './Field'
import { getDevicePosition } from '../utils/geo'

// One field for a map position. Accepts what Google Maps copies ("31.4186, 73.0790");
// the button fills it from this device's location (useful when standing at the shop).
// The parent turns the text into numbers with parseLatLng().
export default function CoordinatesField({ id, label, value, onChange, error, hint, required = false }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function useMyLocation() {
    setBusy(true)
    setNote('')
    try {
      const { lat, lng } = await getDevicePosition({ maximumAge: 0 })
      onChange(`${lat}, ${lng}`)
    } catch (err) {
      setNote(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Field
        label={label}
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error || note}
        hint={hint}
        placeholder="31.4186, 73.0790"
        inputMode="decimal"
        autoComplete="off"
        required={required}
      />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
      >
        <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? 'Finding location…' : 'Use my current location'}
      </button>
    </div>
  )
}
