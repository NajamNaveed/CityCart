// Same money format as the web app: "Rs 4,500" (no decimals unless needed).
// Done by hand rather than with Intl, so every phone prints it identically.
export function formatPrice(value) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return 'Rs 0'
  const [whole, fraction] = (Math.round(number * 100) / 100).toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `Rs ${grouped}${fraction === '00' ? '' : `.${fraction}`}`
}

// "READY_FOR_SHIPMENT" -> "Ready for shipment"
export function humanize(value = '') {
  const text = String(value).toLowerCase().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// "4 Oct 2026, 03:15 pm"; empty for a missing or invalid date.
export function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Rough age for list stamps: "just now", "5m", "2h", "3d", then the date.
export function timeAgo(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return formatDateTime(value).split(',')[0]
}
