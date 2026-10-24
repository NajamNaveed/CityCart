import api from './api'

/**
 * The rider's own deliveries (docs/20, /api/v1/rider/deliveries). The server
 * only ever answers with deliveries assigned to the signed-in rider.
 */
export const DELIVERIES_PAGE_SIZE = 20

export async function fetchDeliveries(scope = 'active', page = 1) {
  const res = await api.get('/rider/deliveries', { params: { scope, page, limit: DELIVERIES_PAGE_SIZE } })
  return { items: res.data.deliveries || [], pagination: res.data.pagination }
}

export async function fetchDelivery(id) {
  const res = await api.get(`/rider/deliveries/${id}`)
  return res.data.delivery
}

// PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY or FAILED (a reason is required for FAILED).
export async function setDeliveryStatus(id, status, failureReason) {
  const res = await api.patch(`/rider/deliveries/${id}/status`, { status, ...(failureReason && { failureReason }) })
  return res.data.delivery
}

// The only way a rider marks a delivery as delivered: with the customer's six-digit code.
export async function completeDelivery(id, code) {
  const res = await api.post(`/rider/deliveries/${id}/complete`, { code })
  return res.data.delivery
}

// The cash this rider holds: collected on delivery, not yet handed to the brand.
export async function fetchCash() {
  const res = await api.get('/rider/deliveries/cash')
  return res.data.cash
}
