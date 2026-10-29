import { getErrorMessage } from '../services/api'

/**
 * What a rider can do with a delivery, from its status. This mirrors the
 * server's delivery lifecycle (server/src/config/deliveryTransitions.js); the
 * server still decides, this only decides which buttons to show.
 *
 *   READY_FOR_PICKUP -> PICKED_UP -> OUT_FOR_DELIVERY -> DELIVERED (with the code) | FAILED
 *   and FAILED -> OUT_FOR_DELIVERY to try again.
 * The server also has IN_TRANSIT between picked up and out for delivery (the brand can set it from
 * the website, for example for a courier). A rider carries the parcel from the brand to the customer
 * in one trip, so the app offers only the one step: after "Picked up" comes "Out for delivery".
 * DELIVERED is not a button: it needs the customer's code.
 */
const MOVES = {
  READY_FOR_PICKUP: [{ status: 'PICKED_UP', label: 'Picked up' }],
  PICKED_UP: [{ status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }],
  // A delivery the brand already marked in transit still moves on the same way.
  IN_TRANSIT: [{ status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' }],
  FAILED: [{ status: 'OUT_FOR_DELIVERY', label: 'Try again' }],
}

export const nextMoves = (status) => MOVES[status] || []
// At the door: the rider enters the code, or records that it could not be delivered.
export const canComplete = (status) => status === 'OUT_FOR_DELIVERY'
export const isClosed = (status) => ['DELIVERED', 'CANCELLED', 'RETURNED'].includes(status)

// Opens the phone app / a map. Plain links, so no extra packages are needed.
export const telUrl = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`

export function mapsUrl(address) {
  if (!address) return null
  const query = [address.address, address.city, address.postalCode].filter(Boolean).join(', ')
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}

// A map link for a position the rider shared.
export const locationMapUrl = (point) => `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`

// "House 5, Street 2, Faisalabad"
export const addressLine = (address) => (address ? [address.address, address.city].filter(Boolean).join(', ') : '')

// How to describe what the server said about the delivery code.
export function codeErrorMessage(err) {
  const data = err?.response?.data
  if (data?.code === 'INVALID_CODE') {
    const left = Number(data.attemptsRemaining)
    if (left > 0) return `That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left.`
    return 'That code is not correct. No tries left: ask the brand to complete this delivery.'
  }
  if (data?.code === 'CODE_LOCKED') return 'Too many wrong codes. Ask the brand to complete this delivery.'
  if (data?.code === 'NO_DELIVERY_CODE') return 'This delivery has no code. Ask the brand to complete it.'
  return getErrorMessage(err)
}

// The cash line shown on a delivery: what to collect, what was collected, a
// non-cash payment waiting on the brand, or nothing for prepaid (docs/21 §I).
export function cashSummary(delivery) {
  if (!delivery) return { kind: 'none' }
  if (delivery.amountToCollect > 0) return { kind: 'collect', amount: delivery.amountToCollect }
  if (delivery.cashCollected) return { kind: 'collected' }
  // A non-cash payment at the door: no cash, and the rider only sees whether the
  // brand has checked it yet — never the reference or the photo.
  if (delivery.proofStatus) return { kind: 'proof', status: delivery.proofStatus }
  return { kind: 'prepaid' }
}

// The methods the rider may offer, from the server (cash only when a proof cannot
// be stored). Labels match server/src/config/paymentCollection.js.
export const PAYMENT_METHODS = [
  { method: 'CASH', label: 'Cash' },
  { method: 'BANK_TRANSFER', label: 'Bank transfer' },
  { method: 'WALLET', label: 'Wallet' },
  { method: 'CARD_MACHINE', label: 'Card machine' },
]
export const WALLETS = [
  { wallet: 'JAZZCASH', label: 'JazzCash' },
  { wallet: 'EASYPAISA', label: 'Easypaisa' },
  { wallet: 'OTHER', label: 'Other' },
]

export const paymentMethodsFor = (delivery) => {
  const allowed = delivery?.paymentOptions || []
  return PAYMENT_METHODS.filter((m) => allowed.includes(m.method))
}

// The app-side gate only saves a round trip; the server validates the same rules.
export function collectionReady(pay) {
  if (!pay?.method) return false
  if (pay.method === 'CASH') return true
  if ((pay.reference || '').trim().length < 3) return false
  if (!pay.proof) return false
  return pay.method !== 'WALLET' || Boolean(pay.wallet)
}

// What the complete call sends. Cash carries no reference and no photo.
export function collectionPayload(pay) {
  if (pay.method === 'CASH') return { method: 'CASH' }
  return {
    method: pay.method,
    ...(pay.method === 'WALLET' && { wallet: pay.wallet }),
    reference: pay.reference.trim(),
    proof: pay.proof,
  }
}

// A payment-proof problem explained to the rider, in their terms.
export function proofErrorMessage(err) {
  const data = err?.response?.data
  if (err?.codeMessage) return err.codeMessage
  if (data?.code === 'PROOF_NOT_CONFIGURED') return 'Payment photos are not set up yet. Ask the brand: take cash only.'
  if (data?.code === 'PROOF_NOT_ALLOWED') return 'A photo can only be added while the delivery is out for delivery.'
  if (data?.code === 'PROOF_NOT_YOURS') return 'That photo does not belong to this delivery. Take it again.'
  if (data?.code === 'PAYMENT_PREPAID') return 'This order was already paid. There is nothing to collect.'
  if (data?.code === 'PAYMENT_ALREADY_COLLECTED') return 'This payment was already collected.'
  return getErrorMessage(err)
}
