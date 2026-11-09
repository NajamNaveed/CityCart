// Service bookings use Karachi wall-clock time (docs/24 §4.4). Providers publish
// weekly windows in minutes from midnight; customers pick a concrete slot.
// Pakistan has had a fixed UTC+5 offset since 2009, so a constant offset keeps
// the app independent of the phone's own timezone and avoids a tz database.
const DAY_MS = 24 * 60 * 60 * 1000
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad2 = (n) => String(n).padStart(2, '0')

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

// 555 -> "9:15 am". Midnight reads as 12:00 am, noon as 12:00 pm.
export function minuteLabel(minutes) {
  const total = ((Number(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(total / 60)
  const rest = total % 60
  const suffix = hours >= 12 ? 'pm' : 'am'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${pad2(rest)} ${suffix}`
}

function dayLabel(day, offsetDays) {
  if (offsetDays === 0) return 'Today'
  if (offsetDays === 1) return 'Tomorrow'
  return `${WEEKDAYS_SHORT[day.weekday]} ${day.date} ${MONTHS[day.month]}`
}

/** "1,200.50" rupees -> integer paisa; null when it is not a usable amount. */
export function toPaisa(text) {
  const cleaned = String(text).replaceAll(',', '').trim()
  if (!cleaned) return null
  const rupees = Number(cleaned)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return Math.round(rupees * 100)
}

export function durationLabel(minutes) {
  const value = Number(minutes) || 0
  if (value < 60) return `${value} min`
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/**
 * Every bookable start for the next `days` days, honouring the published
 * windows, slot length, blackout dates and the current time. Returns [] when
 * the provider has not published hours, which the form treats as "ask for a
 * time instead of picking one".
 */
export function availableSlots(availability, durationMinutes, { days = 10, nowMs = Date.now() } = {}) {
  const windows = availability?.windows || []
  if (windows.length === 0) return []
  const blackout = new Set(availability?.blackoutDates || [])
  const duration = Number(durationMinutes) || 60
  const slots = []

  for (let offset = 0; offset < days; offset += 1) {
    const day = karachiDay(offset, nowMs)
    const key = `${day.year}-${pad2(day.month + 1)}-${pad2(day.date)}`
    if (blackout.has(key)) continue

    const dayWindows = windows
      .filter((window) => window.weekday === day.weekday)
      .sort((a, b) => a.startMinute - b.startMinute)
    if (dayWindows.length === 0) continue

    const label = dayLabel(day, offset)
    for (const window of dayWindows) {
      const step = window.slotMinutes || 60
      for (let minute = window.startMinute; minute + duration <= window.endMinute; minute += step) {
        const startMs =
          Date.UTC(day.year, day.month, day.date, Math.floor(minute / 60), minute % 60) - KARACHI_OFFSET_MS
        if (startMs <= nowMs) continue
        slots.push({
          value: new Date(startMs).toISOString(),
          label: `${label} · ${minuteLabel(minute)}`,
          dateKey: key,
          dateLabel: label,
          timeLabel: minuteLabel(minute),
          startMinute: minute,
        })
      }
    }
  }
  return slots
}

/** The distinct dates in slot order, for the date sheet. */
export function dateOptionsFromSlots(slots) {
  const seen = new Map()
  for (const slot of slots) {
    if (!seen.has(slot.dateKey)) seen.set(slot.dateKey, slot.dateLabel)
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

/** A Karachi wall-clock date and minute -> the UTC instant the server stores. */
export function karachiDateTimeToIso(dateKey, minute) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''))
  const value = Number(minute)
  if (!match || !Number.isInteger(value) || value < 0 || value >= 1440) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const ms = Date.UTC(year, month - 1, date, Math.floor(value / 60), value % 60) - KARACHI_OFFSET_MS
  const shifted = new Date(ms + KARACHI_OFFSET_MS)
  // Reject a day that rolled over, such as 31 February.
  if (shifted.getUTCFullYear() !== year || shifted.getUTCMonth() !== month - 1 || shifted.getUTCDate() !== date) {
    return null
  }
  return new Date(ms).toISOString()
}

// When a provider has no published hours, the shopper asks for any future time:
// the next two weeks, and a sensible daytime range of half-hour starts.
export function customDateOptions({ days = 14, nowMs = Date.now() } = {}) {
  return Array.from({ length: days }, (_, offset) => ({
    value: karachiDateKey(offset, nowMs),
    label: dayLabel(karachiDay(offset, nowMs), offset),
  }))
}

export function customTimeOptions({
  dateKey,
  nowMs = Date.now(),
  stepMinutes = 30,
  startMinute = 8 * 60,
  endMinute = 20 * 60,
} = {}) {
  const options = []
  if (!dateKey) return options
  const isToday = dateKey === karachiDateKey(0, nowMs)
  const earliest = nowMs + 30 * 60 * 1000
  for (let minute = startMinute; minute + stepMinutes <= endMinute; minute += stepMinutes) {
    const iso = karachiDateTimeToIso(dateKey, minute)
    if (!iso) continue
    if (isToday && new Date(iso).getTime() <= earliest) continue
    options.push({ value: minute, label: minuteLabel(minute) })
  }
  return options
}

/** "15 Nov 2026" in Pakistan time; empty for a missing or invalid date. */
export function formatKarachiDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + KARACHI_OFFSET_MS)
  return `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}`
}
