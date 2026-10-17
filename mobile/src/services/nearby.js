import api from './api'
import { getShopperPosition } from './location'
import { isRadius, normalizeRange } from '../utils/range'

export const NEARBY_PAGE_SIZE = 10

/** What is remembered between launches: the chosen block, the last position, the range. */
export function normalizeStored(raw) {
  const empty = { blockId: '', coords: null, range: 'block' }
  if (!raw || typeof raw !== 'object') return empty
  const { lat, lng } = raw.coords || {}
  return {
    blockId: typeof raw.blockId === 'string' ? raw.blockId : '',
    coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    range: normalizeRange(raw.range),
  }
}

/**
 * The /discover request for what the shopper has chosen, or null when there is no
 * city to search in. Distance and block searches need somewhere to measure from;
 * without it the search covers the whole city and `needsArea` says so.
 */
export function discoverQuery({ cityId, blockId = '', coords = null, range = 'block', q = '', page = 1 }) {
  if (!cityId) return null
  const text = String(q).trim()
  const base = {
    cityId,
    page,
    limit: NEARBY_PAGE_SIZE,
    ...(text && { q: text }),
    ...(coords && { lat: coords.lat, lng: coords.lng }),
    ...(blockId && { blockId }),
  }
  if (range === 'block' && blockId) return { ...base, scope: 'block' }
  if (isRadius(range) && (blockId || coords)) return { ...base, scope: 'radius', radiusKm: range }
  return { ...base, scope: 'city' }
}

export const needsArea = ({ range, blockId, coords }) => (range === 'block' && !blockId) || (isRadius(range) && !blockId && !coords)

export async function fetchDiscover(query) {
  const res = await api.get('/discover', { params: query })
  return { items: res.data.items || [], pagination: res.data.pagination, meta: res.data.meta }
}

export async function fetchBlocks(cityId) {
  const res = await api.get('/blocks', { params: { cityId, isActive: true } })
  return Array.isArray(res.data?.blocks) ? res.data.blocks : []
}

/**
 * "Find me": position, then the server turns it into a block and city.
 *   { status: 'found', block, city, coords }
 *   { status: 'outside' }                         the shopper is not in a city we serve
 *   { status: 'denied' | 'servicesOff' | 'timeout' | 'error', canAskAgain? }
 */
export async function locateShopper() {
  let coords
  try {
    coords = await getShopperPosition()
  } catch (err) {
    const status = { DENIED: 'denied', SERVICES_OFF: 'servicesOff', TIMEOUT: 'timeout' }[err.code] || 'error'
    return { status, canAskAgain: err.canAskAgain !== false }
  }
  try {
    const res = await api.get('/blocks/resolve', { params: { lat: coords.lat, lng: coords.lng } })
    if (!res.data.block || !res.data.city) return { status: 'outside' }
    return { status: 'found', block: res.data.block, city: res.data.city, coords }
  } catch {
    return { status: 'error', canAskAgain: true }
  }
}
