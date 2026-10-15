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
