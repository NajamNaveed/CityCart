/**
 * Small helpers shared by the order and delivery screens.
 */

// At the door: nothing more can be done with a closed delivery.
export const isClosed = (status) => ['DELIVERED', 'CANCELLED', 'RETURNED'].includes(status)

// Opens the phone app / a map. Plain links, so no extra packages are needed.
export const telUrl = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`

// A map link for a position a rider shared.
export const locationMapUrl = (point) => `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`

// "House 5, Street 2, Faisalabad"
export const addressLine = (address) => (address ? [address.address, address.city].filter(Boolean).join(', ') : '')

// The reasons a rider can give for goods coming back (docs/22 §F).
export const RETURN_REASONS = {
  DAMAGED: 'Damaged',
  WRONG_ITEM: 'Wrong item',
  MISSING: 'Missing',
  NOT_WANTED: 'Not wanted',
}
export const reasonLabel = (reason) => RETURN_REASONS[reason] || 'Other'

// The goods are on their way back until the store takes them in.
export const isReturnOpen = (status) => status === 'IN_TRANSIT'

export const returnUnits = (ret) => (ret?.lines || []).reduce((sum, line) => sum + line.quantity, 0)

// "2 items coming back" / "2 items back at the store"
export function returnSummaryLine(ret) {
  const units = returnUnits(ret)
  const items = `${units} ${units === 1 ? 'item' : 'items'}`
  return isReturnOpen(ret?.status) ? `${items} coming back` : `${items} back at the store`
}

// What the receive call sends: every line, restocked only when ticked.
export const receiveDecisions = (lines, restock = {}) =>
  (lines || []).map((_, index) => ({ index, restock: Boolean(restock[index]) }))

export const hasReturnPhoto = (line) => Boolean(line?.hasPhoto)
