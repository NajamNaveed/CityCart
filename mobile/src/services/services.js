import api from './api'
import { isRadius } from '../utils/range'

/**
 * Local services (docs/24): discovery, the public provider page and a booking
 * request. Prices travel in paisa; the screens divide by 100 only to display.
 * The server decides which area a provider serves and what a job costs, so the
 * client sends a scope and never an ownership or price floor.
 */

export const SERVICES_PAGE_SIZE = 12
export const MAX_BLOCKS = 10

export const SORT_OPTIONS = [
  { value: 'rank', label: 'Recommended' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price', label: 'Lowest starting price' },
]

const asBlockIds = (value) =>
  (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id).slice(0, MAX_BLOCKS) : [])

/**
 * The /services/discover request for the shopper's chosen area, or null when
 * there is no city yet. Mirrors the web: chosen blocks, a radius around the
 * shopper, or the whole city.
 */
export function serviceDiscoverQuery({
  cityId,
  blockIds = [],
  coords = null,
  origin = null,
  range = 'block',
  q = '',
  categoryId = '',
  sort = 'rank',
  page = 1,
}) {
  if (!cityId) return null
  const ids = asBlockIds(blockIds)
  const text = String(q).trim()
  const base = {
    page,
    limit: SERVICES_PAGE_SIZE,
    sort,
    ...(text && { q: text }),
    ...(categoryId && { categoryId }),
  }
  if (ids.length > 0 && range !== 'city') {
    return {
      ...base,
      scope: 'area',
      blockIds: ids.join(','),
      ...(origin && { lat: origin.lat, lng: origin.lng }),
      ...(isRadius(range) && origin && { radiusKm: range }),
    }
  }
  if (isRadius(range) && coords) {
    return { ...base, scope: 'radius', radiusKm: range, lat: coords.lat, lng: coords.lng }
  }
  return { ...base, cityId, scope: 'city', ...(coords && { lat: coords.lat, lng: coords.lng }) }
}

export async function fetchServiceCategories() {
  const res = await api.get('/services/categories')
  return Array.isArray(res.data?.categories) ? res.data.categories : []
}

export async function discoverServices(query) {
  const res = await api.get('/services/discover', { params: query })
  return {
    items: Array.isArray(res.data?.items) ? res.data.items : [],
    pagination: res.data?.pagination || { page: 1, pages: 0, total: 0 },
    meta: res.data?.meta || {},
  }
}

export async function fetchServiceProvider(slug) {
  const res = await api.get(`/services/providers/${encodeURIComponent(slug)}`)
  return res.data?.provider || null
}

/** The booking request form only supplies the service, time, address and note. */
export async function createServiceBooking(body) {
  const res = await api.post('/services/bookings', body)
  return res.data.booking
}
