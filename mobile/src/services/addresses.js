import api from './api'

/**
 * The shopper's saved delivery addresses. The same rules as the server
 * (server/src/validators/address.validator.js): every address carries a pin, and
 * only spots inside an active delivery block can be saved.
 */
export const MAX_ADDRESSES = 10
export const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,19}$/

export function validateAddress(form) {
  const errors = {}
  const text = (v) => String(v ?? '').trim()

  if (!text(form.label)) errors.label = 'Give this address a name, like Home.'
  else if (text(form.label).length > 40) errors.label = 'That name is too long.'

  if (!text(form.fullName)) errors.fullName = 'Enter the recipient’s full name.'
  else if (text(form.fullName).length > 100) errors.fullName = 'That name is too long.'

  if (!PHONE_PATTERN.test(text(form.phone))) errors.phone = 'Enter a valid phone number, like +92 300 1234567.'

  if (!text(form.addressLine)) errors.addressLine = 'Enter your street address.'
  else if (text(form.addressLine).length > 300) errors.addressLine = 'That address is too long.'

  if (!text(form.city)) errors.city = 'Enter your city.'
  else if (text(form.city).length > 100) errors.city = 'That city name is too long.'

  if (text(form.postalCode).length > 20) errors.postalCode = 'That postal code is too long.'
  if (text(form.additionalInstructions).length > 2000) errors.additionalInstructions = 'Delivery notes are too long.'

  if (!Number.isFinite(form.latitude) || !Number.isFinite(form.longitude)) errors.pin = 'Choose the delivery spot on the map.'

  return errors
}

// Only fields the server wants; empty optional fields are left out (an empty
// state/country would fail their "not empty" rule).
export function addressBody(form) {
  const text = (v) => String(v ?? '').trim()
  return {
    label: text(form.label),
    fullName: text(form.fullName),
    phone: text(form.phone),
    addressLine: text(form.addressLine),
    city: text(form.city),
    ...(text(form.postalCode) && { postalCode: text(form.postalCode) }),
    ...(text(form.additionalInstructions) && { additionalInstructions: text(form.additionalInstructions) }),
    latitude: form.latitude,
    longitude: form.longitude,
    isDefault: form.isDefault === true,
  }
}

export async function fetchAddresses() {
  const res = await api.get('/addresses')
  return Array.isArray(res.data?.addresses) ? res.data.addresses : []
}

export async function createAddress(body) {
  const res = await api.post('/addresses', body)
  return res.data.address
}

export async function updateAddress(id, body) {
  const { label, fullName, phone, addressLine, city, postalCode, additionalInstructions, latitude, longitude } = body
  const res = await api.patch(`/addresses/${id}`, {
    label,
    fullName,
    phone,
    addressLine,
    city,
    ...(postalCode !== undefined && { postalCode }),
    ...(additionalInstructions !== undefined && { additionalInstructions }),
    latitude,
    longitude,
  })
  return res.data.address
}

export async function makeDefaultAddress(id) {
  const res = await api.post(`/addresses/${id}/default`)
  return res.data.address
}

export async function deleteAddress(id) {
  await api.delete(`/addresses/${id}`)
}
