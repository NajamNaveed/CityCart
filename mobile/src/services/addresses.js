import api from './api'

/** A saved address, as the API returns it: the pin as latitude/longitude and the blocks that hold it. */
export async function fetchAddresses() {
  const res = await api.get('/addresses')
  return Array.isArray(res.data?.addresses) ? res.data.addresses : []
}

export async function setDefaultAddress(id) {
  const res = await api.post(`/addresses/${id}/default`)
  return res.data.address
}

export async function deleteAddress(id) {
  await api.delete(`/addresses/${id}`)
}

/** The address a saved entry stands for, in the shape the checkout form keeps. */
export function formFromAddress(address, previous = {}) {
  return {
    ...previous,
    fullName: address.fullName,
    phone: address.phone,
    addressLine: address.addressLine,
    city: address.city,
    postalCode: address.postalCode || '',
    // Standing delivery notes come along, unless the shopper already wrote some for this order.
    additionalInstructions: previous.additionalInstructions?.trim() ? previous.additionalInstructions : address.additionalInstructions || '',
  }
}

/** Which of the cart's items would still be delivered in other blocks (read-only). */
export async function checkCartArea(blockIds) {
  const res = await api.post('/cart/area-check', { blockIds })
  return { deliverable: res.data.deliverable || [], undeliverable: res.data.undeliverable || [] }
}
