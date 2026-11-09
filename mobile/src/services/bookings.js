import api from './api'

/**
 * The shopper's service bookings (docs/24 §4.4). The server owns every
 * transition — prices, slots, who may cancel — so these helpers only shape the
 * calls and answers. Money travels in paisa; screens divide by 100 to display.
 */

export const BOOKINGS_PAGE_SIZE = 10

export const CANCELABLE_STATUSES = ['REQUESTED', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS']

const EVENT_LABELS = {
  REQUESTED: 'Request sent',
  ACCEPTED: 'Booking accepted',
  PROPOSED: 'Price proposal sent',
  PROPOSAL_ACCEPTED: 'Proposal accepted',
  PROPOSAL_DECLINED: 'Proposal declined',
  PROPOSAL_EXPIRED: 'Proposal expired',
  OFFER_ACCEPTED: 'Your offer accepted',
  OFFER_DECLINED: 'Request declined',
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
  if (booking.customerOfferPaisa != null) return booking.customerOfferPaisa
  return booking.offering?.startingAtPrice ?? 0
}

export const bookingWhen = (booking) => booking.scheduledStart || booking.requestedStart
export const canCancel = (booking) => CANCELABLE_STATUSES.includes(booking.status)

export const STATUS_NOTES = {
  COMPLETED: 'Confirm the job',
  PROPOSED: 'Price ready',
}

export const eventLabel = (event) => EVENT_LABELS[event.type] || 'Booking updated'

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

export async function fetchBookings(page = 1, status = '') {
  const res = await api.get('/services/bookings', {
    params: { limit: BOOKINGS_PAGE_SIZE, page, ...(status && { status }) },
  })
  return { items: res.data.bookings || [], pagination: res.data.pagination }
}

export async function fetchBooking(id) {
  const res = await api.get(`/services/bookings/${id}`)
  return res.data.booking
}

// The provider's proposal: accept locks the slot and price, decline closes it.
export async function answerProposal(id, action) {
  const res = await api.post(`/services/bookings/${id}/proposals/${action}`)
  return res.data.booking
}

export async function confirmBooking(id) {
  const res = await api.post(`/services/bookings/${id}/confirm`)
  return res.data.booking
}

export async function disputeBooking(id, reason) {
  const res = await api.post(`/services/bookings/${id}/dispute`, { reason })
  return res.data.booking
}

export async function cancelBooking(id, reason) {
  const res = await api.post(`/services/bookings/${id}/cancel`, { reason })
  return res.data.booking
}

export async function postBookingReview(id, { rating, comment }) {
  const res = await api.post(`/services/bookings/${id}/review`, {
    rating,
    ...(comment && { comment }),
  })
  return res.data.review
}

/**
 * The thread that belongs to one booking. The routes are keyed by the booking
 * id, not the conversation id, so a notification deep link can open it directly.
 */
export async function fetchBookingMessages(bookingId, { before } = {}) {
  const params = { limit: 30 }
  if (before) params.before = before
  const res = await api.get(`/services/chats/${bookingId}/messages`, { params })
  return { messages: res.data.messages || [], hasMore: Boolean(res.data.hasMore) }
}

export async function sendBookingMessage(bookingId, body) {
  const res = await api.post(`/services/chats/${bookingId}/messages`, { body })
  return res.data.message
}

export async function markBookingChatRead(bookingId) {
  await api.post(`/services/chats/${bookingId}/read`)
}
