export const MAX_MESSAGE_LENGTH = 1000

export const isObjectId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)

const sameDay = (a, b) => a.toDateString() === b.toDateString()

// "Today", "Yesterday" or a date, for the dividers between days in a thread.
export function dayLabel(value) {
  const date = new Date(value)
  const now = new Date()
  if (sameDay(date, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export const clockTime = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Short stamp for the conversation list: time today, otherwise the day.
export function listTime(value) {
  const date = new Date(value)
  return sameDay(date, new Date()) ? clockTime(value) : dayLabel(value)
}

export const initialOf = (name = '') => (name.trim()[0] || '?').toUpperCase()
