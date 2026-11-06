// Service bookings use Karachi wall-clock time (docs/24 §4.4). Providers publish
// weekly windows in minutes from midnight; customers pick a concrete slot. The
// helpers below turn those windows into bookable times without depending on the
// viewer's own timezone.
const DAY_MS = 24 * 60 * 60 * 1000
// Pakistan has used a fixed UTC+5 offset since 2009 (no daylight saving), so a
// constant offset is correct and simpler than a timezone database lookup.
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad2 = (n) => String(n).padStart(2, '0')

export function minutesToTimeInput(minutes) {
  const safe = Math.max(0, Math.min(1440, Number(minutes) || 0))
  const hours = Math.floor(safe / 60)
  const rest = safe % 60
  return `${pad2(hours === 24 ? 23 : hours)}:${pad2(hours === 24 ? 59 : rest)}`
}

export function timeInputToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function minuteLabel(minutes) {
  const total = ((Number(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(total / 60)
  const rest = total % 60
  const suffix = hours >= 12 ? 'pm' : 'am'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${pad2(rest)} ${suffix}`
}

function karachiDay(offsetDays, nowMs) {
  const shifted = new Date(nowMs + KARACHI_OFFSET_MS + offsetDays * DAY_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

export function karachiDateKey(offsetDays = 0, nowMs = Date.now()) {
  const { year, month, date } = karachiDay(offsetDays, nowMs)
  return `${year}-${pad2(month + 1)}-${pad2(date)}`
}

const dayLabelFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Karachi',
})

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Karachi',
})

export const formatKarachiDateTime = (value) => (value ? dateTimeFormat.format(new Date(value)) : '')
export const formatKarachiDate = (value) => (value ? dateFormat.format(new Date(value)) : '')

/**
 * Every bookable start for the next `days` days, honouring the published
 * windows, slot length, blackout dates and the current time. Returns [] when
 * the provider has not published hours, which the forms treat as "ask for a
 * time instead of picking one".
 */
export function availableSlots(availability, durationMinutes, { days = 10, nowMs = Date.now() } = {}) {
  const windows = availability?.windows || []
  if (!windows.length) return []
  const blackout = new Set(availability?.blackoutDates || [])
  const duration = Number(durationMinutes) || 60
  const slots = []

  for (let offset = 0; offset < days; offset += 1) {
    const day = karachiDay(offset, nowMs)
    const key = `${day.year}-${pad2(day.month + 1)}-${pad2(day.date)}`
    if (blackout.has(key)) continue

    const dayWindows = windows
      .filter((w) => w.weekday === day.weekday)
      .sort((a, b) => a.startMinute - b.startMinute)
    if (dayWindows.length === 0) continue

    const dateLabel = dayLabelFormat.format(new Date(Date.UTC(day.year, day.month, day.date)))

    for (const window of dayWindows) {
      const step = window.slotMinutes || 60
      for (let minute = window.startMinute; minute + duration <= window.endMinute; minute += step) {
        const startMs = Date.UTC(day.year, day.month, day.date, Math.floor(minute / 60), minute % 60) - KARACHI_OFFSET_MS
        if (startMs <= nowMs) continue
        slots.push({
          value: new Date(startMs).toISOString(),
          label: `${dateLabel} · ${minuteLabel(minute)}`,
          dateKey: key,
          startMinute: minute,
        })
      }
    }
  }
  return slots
}

/** ISO instant -> value for <input type="datetime-local"> in Pakistan time. */
export function isoToKarachiInput(value) {
  if (!value) return ''
  const shifted = new Date(new Date(value).getTime() + KARACHI_OFFSET_MS)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`
}

/** The reverse: a Pakistan wall-clock input -> ISO instant. */
export function karachiInputToIso(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const [datePart, timePart] = value.split('T')
  const [year, month, date] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  if (!year || !month || !date || hours > 23 || minutes > 59) return null
  const ms = Date.UTC(year, month - 1, date, hours, minutes) - KARACHI_OFFSET_MS
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** True when two windows of the same weekday share minutes. */
export function hasWindowOverlap(windows) {
  const byDay = new Map()
  for (const window of windows) {
    const list = byDay.get(window.weekday) || []
    list.push(window)
    byDay.set(window.weekday, list)
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute)
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) return true
    }
  }
  return false
}
