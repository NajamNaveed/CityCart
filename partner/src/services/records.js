import api from './api'

/**
 * What a brand team member can see (docs/20 §6.3): orders, deliveries and riders,
 * receipts, and the cash held by riders. Each call is an existing brand endpoint,
 * so the server pins everything to the signed-in person's own brand and checks the
 * permission (orders.view, delivery.view, riders.view, payments.view/manage).
 */
export const PAGE_SIZE = 20

const pageOf = (res, key) => ({ items: res.data[key] || [], pagination: res.data.pagination })

// --- Orders (orders.view) ---
export async function fetchOrders(status, page = 1) {
  const res = await api.get('/brand/orders', { params: { ...(status && { status }), page, limit: PAGE_SIZE } })
  return pageOf(res, 'orders')
}

export async function fetchOrder(id) {
  const res = await api.get(`/brand/orders/${id}`)
  return { order: res.data.order, payment: res.data.payment, delivery: res.data.delivery }
}

// --- Deliveries (delivery.view) ---
export async function fetchShipments(status, page = 1) {
  const res = await api.get('/deliveries', { params: { ...(status && { status }), page, limit: PAGE_SIZE } })
  return pageOf(res, 'deliveries')
}

export async function fetchShipment(id) {
  const res = await api.get(`/deliveries/${id}`)
  return res.data.delivery
}

// --- Riders and assignment (riders.view to pick, delivery.manage to assign) ---
export async function fetchActiveRiders() {
  const res = await api.get('/riders', { params: { isActive: true, limit: 50 } })
  return res.data.riders || []
}

// riderId null takes the rider off the delivery.
export async function assignRider(deliveryId, riderId) {
  const res = await api.patch(`/deliveries/${deliveryId}/rider`, { riderId })
  return res.data.delivery
}

// --- Receipts (payments.view) ---
export async function fetchReceipts(page = 1) {
  const res = await api.get('/receipts', { params: { page, limit: PAGE_SIZE } })
  return pageOf(res, 'receipts')
}

export async function fetchReceipt(id) {
  const res = await api.get(`/receipts/${id}`)
  return res.data.receipt
}

// --- Cash held by riders (payments.view to see, payments.manage to settle) ---
export async function fetchCashCollectors() {
  const res = await api.get('/payments/cash/outstanding')
  return res.data.collectors || []
}

export async function fetchCollectorCash(collectorId) {
  const res = await api.get('/payments/cash/outstanding', { params: { collectorId } })
  return { payments: res.data.payments || [], total: res.data.total || 0 }
}

// Exactly the payments that were counted and received; all or nothing (409 CASH_CHANGED).
export async function settleCash(collectorId, paymentIds) {
  const res = await api.post('/payments/cash/settle', { collectorId, paymentIds })
  return { settled: res.data.settled, total: res.data.total }
}

// --- Overview: a few small counts, only for what this person may see ---
const COUNTED_DELIVERIES = ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED', 'DELIVERED']

async function countDeliveries(status) {
  const res = await api.get('/deliveries', { params: { status, page: 1, limit: 1 } })
  return res.data.pagination?.total ?? 0
}

/**
 * { counts: { READY_FOR_PICKUP: n, ... } | null, cash: { total, holders } | null, failed: [...] }
 * A part the person may not see (or that fails) comes back null, so the screen shows
 * what it can and never an error for something they were never meant to see.
 */
export async function fetchOverview({ deliveries, money }) {
  const [counts, cash] = await Promise.all([
    deliveries
      ? Promise.all(COUNTED_DELIVERIES.map(async (s) => [s, await countDeliveries(s)])).then(Object.fromEntries).catch(() => null)
      : null,
    money
      ? fetchCashCollectors()
          .then((collectors) => ({ total: collectors.reduce((sum, c) => sum + c.total, 0), holders: collectors.length }))
          .catch(() => null)
      : null,
  ])
  return { counts, cash }
}

// "On the road" is three delivery statuses to the person reading the screen.
export const onTheRoad = (counts) => (counts ? (counts.PICKED_UP || 0) + (counts.IN_TRANSIT || 0) + (counts.OUT_FOR_DELIVERY || 0) : 0)

// Filter chips: [server status or undefined for everything, label].
export const ORDER_FILTERS = [
  [undefined, 'All'],
  ['PENDING', 'Pending'],
  ['CONFIRMED', 'Confirmed'],
  ['PROCESSING', 'Processing'],
  ['READY_FOR_SHIPMENT', 'Ready'],
  ['SHIPPED', 'Shipped'],
  ['OUT_FOR_DELIVERY', 'Out for delivery'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
  ['REJECTED', 'Rejected'],
  ['RETURNED', 'Returned'],
]

export const SHIPMENT_FILTERS = [
  [undefined, 'All'],
  ['READY_FOR_PICKUP', 'To pick up'],
  ['PICKED_UP', 'Picked up'],
  ['IN_TRANSIT', 'In transit'],
  ['OUT_FOR_DELIVERY', 'Out for delivery'],
  ['DELIVERED', 'Delivered'],
  ['FAILED', 'Failed'],
  ['RETURNED', 'Returned'],
]
