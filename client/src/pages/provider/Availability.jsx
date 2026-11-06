import { useEffect, useState } from 'react'
import { CalendarOff, Clock3, Plus, Save, Trash2 } from 'lucide-react'
import api, { getErrorMessage } from '../../services/api'
import { Notice, PageHeader } from '../../components/brand/Bits'
import { Skeleton } from '../../components/ui'
import { btnPine } from '../../ui'
import {
  WEEKDAYS,
  availableSlots,
  hasWindowOverlap,
  minutesToTimeInput,
  timeInputToMinutes,
} from '../../utils/serviceSlots'

const labelClass = 'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-muted'
const smallInput = 'h-9 rounded-md border border-line bg-white px-2.5 text-[13px] text-ink outline-none transition focus:border-ink'

let nextKeySeed = 0
const newKey = () => `window-${nextKeySeed++}`

function windowOf(weekday, start = '09:00', end = '17:00') {
  return { key: newKey(), weekday, start, end, slotMinutes: '60' }
}

const STANDARD_WEEK = [1, 2, 3, 4, 5, 6].map((weekday) => windowOf(weekday))

export default function ProviderAvailability() {
  const [state, setState] = useState({ loaded: false, error: '', updatedAt: null })
  const [windows, setWindows] = useState([])
  const [blackoutDates, setBlackoutDates] = useState([])
  const [newBlackout, setNewBlackout] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/services/provider/availability')
      .then((res) => {
        if (!active) return
        const availability = res.data.availability
        setWindows(
          availability.windows.map((window) => ({
            key: newKey(),
            weekday: window.weekday,
            start: minutesToTimeInput(window.startMinute),
            end: minutesToTimeInput(window.endMinute),
            slotMinutes: String(window.slotMinutes),
          })),
        )
        setBlackoutDates(availability.blackoutDates)
        setState({ loaded: true, error: '', updatedAt: availability.updatedAt })
      })
      .catch((err) => active && setState({ loaded: true, error: getErrorMessage(err), updatedAt: null }))
    return () => {
      active = false
    }
  }, [])

  function patchWindow(key, patch) {
    setWindows((list) => list.map((window) => (window.key === key ? { ...window, ...patch } : window)))
  }

  function addWindow(weekday) {
    if (windows.length >= 21) {
      setError('At most three windows per day (21 a week).')
      return
    }
    setWindows((list) => [...list, windowOf(weekday)])
    setNotice('')
  }

  function removeWindow(key) {
    setWindows((list) => list.filter((window) => window.key !== key))
    setNotice('')
  }

  function useStandardWeek() {
    setWindows(STANDARD_WEEK.map((window) => ({ ...window, key: newKey() })))
    setError('')
    setNotice('')
  }

  function addBlackout() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newBlackout)) {
      setError('Choose a date from the calendar.')
      return
    }
    if (blackoutDates.includes(newBlackout)) {
      setError('That date is already listed.')
      return
    }
    if (blackoutDates.length >= 60) {
      setError('At most 60 blackout dates are allowed.')
      return
    }
    setBlackoutDates((list) => [...list, newBlackout].sort())
    setNewBlackout('')
    setError('')
    setNotice('')
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    const cleaned = []
    for (const window of windows) {
      const startMinute = timeInputToMinutes(window.start)
      const endMinute = timeInputToMinutes(window.end)
      const slotMinutes = Number(window.slotMinutes)
      if (startMinute === null || endMinute === null) {
        setError('Each day needs a start and end time.')
        return
      }
      if (endMinute <= startMinute) {
        setError(`${WEEKDAYS[window.weekday]} ends before it starts.`)
        return
      }
      if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240) {
        setError('The slot length must be between 15 and 240 minutes.')
        return
      }
      cleaned.push({ weekday: window.weekday, startMinute, endMinute, slotMinutes })
    }
    if (hasWindowOverlap(cleaned)) {
      setError('Two windows on the same day overlap. Adjust the hours so they do not share time.')
      return
    }

    setSaving(true)
    try {
      const res = await api.put('/services/provider/availability', { windows: cleaned, blackoutDates })
      const availability = res.data.availability
      setWindows(
        availability.windows.map((window) => ({
          key: newKey(),
          weekday: window.weekday,
          start: minutesToTimeInput(window.startMinute),
          end: minutesToTimeInput(window.endMinute),
          slotMinutes: String(window.slotMinutes),
        })),
      )
      setState((s) => ({ ...s, updatedAt: availability.updatedAt }))
      setNotice('Availability saved. Customers now see these times.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!state.loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    )
  }

  if (state.error) {
    return (
      <>
        <PageHeader title="Working hours" />
        <p className="text-clay">{state.error}</p>
      </>
    )
  }

  const preview = availableSlots(
    {
      isPublished: windows.length > 0,
      windows: windows.map((window) => ({
        weekday: window.weekday,
        startMinute: timeInputToMinutes(window.start) ?? 0,
        endMinute: timeInputToMinutes(window.end) ?? 0,
        slotMinutes: Number(window.slotMinutes) || 60,
      })),
      blackoutDates,
    },
    60,
    { days: 7 },
  )

  return (
    <form onSubmit={save}>
      <PageHeader
        title="Working hours"
        intro="The times customers may book. They are shown in Pakistan time; blackout days are whole days off."
        action={
          <button type="submit" disabled={saving} className={btnPine}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save hours'}
          </button>
        }
      />
      <Notice>{notice}</Notice>
      {error && (
        <p role="alert" className="mb-6 rounded-md bg-clay/5 px-3.5 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

      {windows.length === 0 && (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning-soft p-5">
          <p className="text-[13.5px] leading-relaxed text-warning">
            No hours published: customers can still request any future time, and you confirm each one manually.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Clock3 className="h-4 w-4 text-muted" aria-hidden="true" />
            Weekly hours
          </h2>
          <button
            type="button"
            onClick={useStandardWeek}
            className="inline-flex h-9 items-center rounded-md border border-line px-3 text-[12.5px] font-medium text-ink transition hover:border-ink"
          >
            Use Mon–Sat, 9–5
          </button>
        </div>

        <div className="divide-y divide-line">
          {WEEKDAYS.map((name, weekday) => {
            const list = windows.filter((window) => window.weekday === weekday)
            return (
              <div key={weekday} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px] font-medium text-ink">{name}</p>
                  <button
                    type="button"
                    onClick={() => addWindow(weekday)}
                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pine transition hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add hours
                  </button>
                </div>
                {list.length === 0 ? (
                  <p className="mt-1 text-[12.5px] text-muted">Not working</p>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {list.map((window) => (
                      <li key={window.key} className="flex flex-wrap items-end gap-2">
                        <div>
                          <label htmlFor={`${window.key}-start`} className={labelClass}>
                            From
                          </label>
                          <input
                            id={`${window.key}-start`}
                            type="time"
                            value={window.start}
                            onChange={(e) => patchWindow(window.key, { start: e.target.value })}
                            className={smallInput}
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor={`${window.key}-end`} className={labelClass}>
                            To
                          </label>
                          <input
                            id={`${window.key}-end`}
                            type="time"
                            value={window.end}
                            onChange={(e) => patchWindow(window.key, { end: e.target.value })}
                            className={smallInput}
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor={`${window.key}-slot`} className={labelClass}>
                            Slot
                          </label>
                          <input
                            id={`${window.key}-slot`}
                            type="number"
                            min="15"
                            max="240"
                            step="15"
                            inputMode="numeric"
                            value={window.slotMinutes}
                            onChange={(e) => patchWindow(window.key, { slotMinutes: e.target.value })}
                            className={`w-20 ${smallInput}`}
                            required
                          />
                        </div>
                        <span className="pb-2 text-[11.5px] text-muted">min per booking</span>
                        <button
                          type="button"
                          onClick={() => removeWindow(window.key)}
                          aria-label={`Remove ${name} hours`}
                          className="mb-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-danger/40 text-danger transition hover:border-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-line bg-white p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <CalendarOff className="h-4 w-4 text-muted" aria-hidden="true" />
          Days off
        </h2>
        <p className="mt-1 text-[13px] text-muted">Whole days you are unavailable, even if your weekly hours say otherwise.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="blackout-date" className={labelClass}>
              Date
            </label>
            <input
              id="blackout-date"
              type="date"
              value={newBlackout}
              onChange={(e) => setNewBlackout(e.target.value)}
              className={smallInput}
            />
          </div>
          <button
            type="button"
            onClick={addBlackout}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] font-medium text-ink transition hover:border-ink"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add day off
          </button>
        </div>
        {blackoutDates.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {blackoutDates.map((date) => (
              <li
                key={date}
                className="inline-flex items-center gap-1.5 rounded-md bg-paper px-2.5 py-1.5 text-[12.5px] text-ink"
              >
                {date}
                <button
                  type="button"
                  onClick={() => setBlackoutDates((list) => list.filter((item) => item !== date))}
                  aria-label={`Remove ${date}`}
                  className="text-muted transition hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] text-muted">No days off listed.</p>
        )}
      </section>

      <p className="mt-6 rounded-md bg-paper px-4 py-3 text-[12.5px] leading-relaxed text-muted">
        {preview.length} bookable hour{preview.length === 1 ? '' : 's'} in the next seven days with these settings.
        {state.updatedAt ? ` Last saved ${new Date(state.updatedAt).toLocaleString()}.` : ''}
      </p>
    </form>
  )
}
