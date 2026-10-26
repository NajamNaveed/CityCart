import api from './api'

/** Checkout rules: the same ones the server enforces (server/src/validators/order.validator.js). */
export const MAX_NOTE_WORDS = 200
const MAX_NOTE_CHARS = 2000
export const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/

export const countWords = (value = '') => {
  const trimmed = String(value).trim()
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
}

// { field: message } for anything the server would refuse; empty when the form is fine.
export function validateCheckout(form) {
  const errors = {}
  const text = (v) => String(v ?? '').trim()

  if (!text(form.fullName)) errors.fullName = 'Enter your full name.'
  else if (text(form.fullName).length > 100) errors.fullName = 'That name is too long.'

  if (!PHONE_PATTERN.test(text(form.phone))) errors.phone = 'Enter a valid phone number, like +92 300 1234567.'

  if (!text(form.addressLine)) errors.addressLine = 'Enter your street address.'
  else if (text(form.addressLine).length > 300) errors.addressLine = 'That address is too long.'

  if (!text(form.city)) errors.city = 'Enter your city.'
  else if (text(form.city).length > 100) errors.city = 'That city name is too long.'

  if (text(form.postalCode).length > 20) errors.postalCode = 'That postal code is too long.'

  const words = countWords(form.additionalInstructions)
  if (words < 1) errors.additionalInstructions = 'Delivery notes are required: the courier needs them to reach you.'
  else if (words > MAX_NOTE_WORDS) errors.additionalInstructions = `Delivery notes must be at most ${MAX_NOTE_WORDS} words.`
  else if (text(form.additionalInstructions).length > MAX_NOTE_CHARS) errors.additionalInstructions = 'Delivery notes are too long.'

  return errors
}

// The server reads the cart itself; the app only sends where to deliver and how to pay.
export function orderBody(form, paymentMethod = 'COD') {
  const text = (v) => String(v ?? '').trim()
  return {
    paymentMethod,
    shippingAddress: {
      fullName: text(form.fullName),
      phone: text(form.phone),
      addressLine: text(form.addressLine),
      city: text(form.city),
      ...(text(form.postalCode) && { postalCode: text(form.postalCode) }),
      additionalInstructions: text(form.additionalInstructions),
    },
  }
}

// "shippingAddress.phone" -> "phone", so server errors land under the right field.
export function checkoutFieldErrors(fieldErrors = {}) {
  return Object.fromEntries(Object.entries(fieldErrors).map(([field, message]) => [field.replace(/^shippingAddress\./, ''), message]))
}

export async function placeOrder(form, paymentMethod = 'COD') {
  const res = await api.post('/orders', orderBody(form, paymentMethod))
  return res.data.orders
}

// What the customer can pay with. Cash is always possible; paying online appears only while the
// server has a payment gateway switched on (docs/10 §29).
export async function fetchPaymentMethods() {
  const res = await api.get('/payments/methods')
  return res.data.methods
}

// The gateway page where one online order is paid. The server checks the order is the caller's
// and still waiting for payment; nothing is marked paid by the app (only the gateway's
// confirmation does that).
export async function startOnlinePayment(orderId) {
  const res = await api.post(`/payments/order/${orderId}/checkout`)
  return res.data
}

export const isOnline = (order) => order?.paymentMethod === 'ONLINE_GATEWAY'
export const awaitingPayment = ({ order, payment }) => isOnline(order) && payment?.status === 'PENDING' && order?.orderStatus === 'PENDING'

export async function fetchMyOrders(page = 1, limit = 10) {
  const res = await api.get('/orders/my', { params: { page, limit } })
  return { items: res.data.orders || [], pagination: res.data.pagination }
}

export async function fetchOrder(id) {
  const res = await api.get(`/orders/${id}`)
  return { order: res.data.order, payment: res.data.payment, delivery: res.data.delivery }
}

// While the order is on its way the customer reads a six-digit code to the rider; the
// rider cannot mark the order delivered without it (docs/11, docs/20 §7). The server
// only gives it to the customer who owns the order, and only in these statuses.
export const CODE_VISIBLE_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED']

export async function fetchDeliveryCode(deliveryId) {
  const res = await api.get(`/deliveries/${deliveryId}/code`)
  return res.data.code
}

// Where the rider is, only while the order is out for delivery and the rider chose to share it
// (docs/11 §30). { latitude, longitude, accuracy, recordedAt } or null.
export async function fetchRiderLocation(deliveryId) {
  const res = await api.get(`/deliveries/${deliveryId}/rider-location`)
  return res.data.location
}

// A map link for a shared position: opens the phone's maps app, no map library needed.
export const locationMapUrl = (point) => `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`

// The receipt of a paid order (docs/10 §28).
export async function fetchReceipt(orderId) {
  const res = await api.get(`/receipts/order/${orderId}`)
  return res.data.receipt
}

export async function cancelOrder(id) {
  const res = await api.patch(`/orders/${id}/cancel`)
  return res.data.order
}

/** The order's journey, for the progress display. */
export const STAGES = [
  { status: 'PENDING', label: 'Placed', icon: 'file-text' },
  { status: 'CONFIRMED', label: 'Confirmed', icon: 'check-circle' },
  { status: 'PROCESSING', label: 'Processing', icon: 'package' },
  { status: 'SHIPPED', label: 'Shipped', icon: 'truck' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery', icon: 'map-pin' },
  { status: 'DELIVERED', label: 'Delivered', icon: 'check' },
]

const STAGE_INDEX = { PENDING: 0, CONFIRMED: 1, PROCESSING: 2, READY_FOR_SHIPMENT: 2, SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5 }

export const TERMINAL_PROBLEMS = {
  CANCELLED: 'This order was cancelled. Any reserved stock has been returned.',
  REJECTED: 'The brand could not fulfil this order. You were not charged.',
}

// Which stage the order has reached: the furthest one in its history, or its current status.
export function currentStage(history, orderStatus) {
  const fromHistory = Math.max(-1, ...(history || []).map((h) => STAGE_INDEX[h.status] ?? -1))
  return Math.max(fromHistory, STAGE_INDEX[orderStatus] ?? 0)
}

// done | current | ahead, for each of the six stages, with the time it was reached.
export function stageRows(history, orderStatus) {
  const current = currentStage(history, orderStatus)
  return STAGES.map((stage, i) => {
    const entry = (history || []).find((h) => STAGE_INDEX[h.status] === i)
    return { ...stage, state: i < current ? 'done' : i === current ? 'current' : 'ahead', at: entry ? entry.at : null }
  })
}

// Orders can only be cancelled until the brand confirms them.
export const canCancel = (order) => order?.orderStatus === 'PENDING'

// The orders just placed, held in memory for the confirmation screen only. Kept out of the
// navigation address so nothing in it can be tampered with, and gone when the app closes.
let placed = []
export const rememberPlacedOrders = (orders) => {
  placed = Array.isArray(orders) ? orders : []
}
export const takePlacedOrders = () => placed
