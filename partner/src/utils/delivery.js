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
