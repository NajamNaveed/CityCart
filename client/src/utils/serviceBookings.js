import { humanize } from '../ui'

export const BOOKING_STATUSES = [
  'REQUESTED',
  'PROPOSED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'DISPUTED',
]

export const CANCELABLE_STATUSES = ['REQUESTED', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS']

const EVENT_LABELS = {
  REQUESTED: 'Request sent',
  ACCEPTED: 'Booking accepted',
  PROPOSED: 'Price proposal sent',
  PROPOSAL_ACCEPTED: 'Proposal accepted',
  PROPOSAL_DECLINED: 'Proposal declined',
  PROPOSAL_EXPIRED: 'Proposal expired',
  STARTED: 'Job started',
  COMPLETED: 'Job completed',
  CONFIRMED: 'Completion confirmed',
  AUTO_CONFIRMED: 'Auto-confirmed after three days',
  CANCELLED: 'Booking cancelled',
  DISPUTED: 'Dispute opened',
  DISPUTE_RESOLVED: 'Dispute resolved',
}

/** The amount that matters now: what was charged, what was agreed, or the live quote. */
export function priceOf(booking) {
  if (booking.finalAmountPaisa != null) return booking.finalAmountPaisa
  if (booking.agreedPricePaisa != null) return booking.agreedPricePaisa
  if (booking.activeProposal) return booking.activeProposal.pricePaisa
  return booking.offering?.startingAtPrice ?? 0
}

export const bookingWhen = (booking) => booking.scheduledStart || booking.requestedStart
export const canCancel = (booking) => CANCELABLE_STATUSES.includes(booking.status)

export const eventLabel = (event) => EVENT_LABELS[event.type] || humanize(event.type || '')

/** Extra detail for a timeline row: the note the person wrote, or the price in the event. */
export function eventDetail(event) {
  if (event.note) return event.note
  if (event.meta && Number.isFinite(Number(event.meta.pricePaisa))) {
    return `PKR ${(Number(event.meta.pricePaisa) / 100).toFixed(2)}`
  }
  if (event.meta && Number.isFinite(Number(event.meta.finalAmountPaisa))) {
    return `Final PKR ${(Number(event.meta.finalAmountPaisa) / 100).toFixed(2)}`
  }
  if (event.byRole === 'SYSTEM') return 'By CityCart'
  return ''
}

/** "1,200.50" rupees -> integer paisa; null when it is not a usable amount. */
export function toPaisa(text) {
  const cleaned = String(text).replaceAll(',', '').trim()
  if (!cleaned) return null
  const rupees = Number(cleaned)
  if (!Number.isFinite(rupees) || rupees < 0) return null
  return Math.round(rupees * 100)
}

export function toRupees(paisa) {
  return Number.isFinite(paisa) ? String(paisa / 100) : ''
}

export const durationLabel = (minutes) => {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}
