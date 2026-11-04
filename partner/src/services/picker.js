import api from './api'

/**
 * A picker's work (docs/22 §E): the brand's accepted orders waiting to be
 * picked, the lines of one order, and the proposal a short line needs.
 * Every call is a `/picker` endpoint, so the server pins the answer to the
 * picker's own brand and returns no customer contact details or money.
 */
export const PICK_PAGE_SIZE = 20

export async function fetchPickQueue(page = 1) {
  const res = await api.get('/picker', { params: { page, limit: PICK_PAGE_SIZE } })
  return { items: res.data.orders || [], pagination: res.data.pagination }
}

export async function fetchPickOrder(id) {
  const res = await api.get(`/picker/${id}`)
  return res.data.order
}

export async function claimPickOrder(id) {
  const res = await api.post(`/picker/${id}/claim`)
  return res.data.order
}

// pickStatus: PICKED (all units), SHORT (pickedQty units found), UNAVAILABLE (none).
export async function setPickLine(id, itemId, pickStatus, pickedQty) {
  const res = await api.patch(`/picker/${id}/items/${itemId}`, {
    pickStatus,
    ...(pickedQty !== undefined && { pickedQty }),
  })
  return res.data.order
}

// The lines that were marked short become the customer's choice. Quantities
// come from those marks on the server, not from this body.
export async function proposePickChange(id, { note, substitutes, restockRemoved }) {
  const res = await api.post(`/picker/${id}/propose`, {
    note,
    ...(restockRemoved && { restockRemoved }),
    ...(substitutes?.length && { substitutes }),
  })
  return res.data.adjustment
}

export async function packPickOrder(id) {
  const res = await api.post(`/picker/${id}/pack`)
  return res.data.order
}

// Same-brand active products for a substitute. Ids, name, sku and image only.
export async function searchPickProducts(q) {
  const res = await api.get('/picker/products', { params: { ...(q && { q }), limit: 20 } })
  return res.data.products || []
}
