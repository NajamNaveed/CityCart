import api from './api'
import { getShopperPosition } from './location'
import { isRadius, normalizeRange } from '../utils/range'

export const NEARBY_PAGE_SIZE = 10

const MAX_BLOCKS = 10
const asBlockIds = (value) =>
  (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id).slice(0, MAX_BLOCKS) : [])

/** What is remembered between launches: the chosen blocks, the last position, the range. */
export function normalizeStored(raw) {
  const empty = { blockIds: [], coords: null, pinned: false, range: 'block' }
  if (!raw || typeof raw !== 'object') return empty
  const { lat, lng } = raw.coords || {}
  // An older version kept a single block id.
  const ids = Array.isArray(raw.blockIds) ? asBlockIds(raw.blockIds) : typeof raw.blockId === 'string' && raw.blockId ? [raw.blockId] : []
  return {
    blockIds: ids,
    coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    pinned: raw.pinned === true,
    range: normalizeRange(raw.range),
  }
}

/**
 * The /discover request for what the shopper has chosen, or null when there is no
 * city to search in. One or several blocks form the area (several where zones
 * overlap); a radius is measured from the shopper's position inside that area.
 * Without an area the search covers the city and `needsArea` says so.
 */
export function discoverQuery({ cityId, blockIds = [], coords = null, range = 'block', q = '', page = 1 }) {
  if (!cityId) return null
  const text = String(q).trim()
  const ids = asBlockIds(blockIds)
  const base = { page, limit: NEARBY_PAGE_SIZE, ...(text && { q: text }) }
  if (ids.length > 0 && range !== 'city') {
    return {
      ...base,
      cityId,
      scope: 'area',
      blockIds: ids.join(','),
      ...(coords && { lat: coords.lat, lng: coords.lng }),
      ...(isRadius(range) && coords && { radiusKm: range }),
    }
  }
  // Between blocks (or pinned outside every zone): a radius around the shopper.
  if (isRadius(range) && coords) {
    return { ...base, cityId, scope: 'radius', radiusKm: range, lat: coords.lat, lng: coords.lng }
  }
  return { ...base, cityId, scope: 'city', ...(coords && { lat: coords.lat, lng: coords.lng }) }
}

export const needsArea = ({ range, blockIds = [], coords }) =>
  (range === 'block' && blockIds.length === 0) || (isRadius(range) && blockIds.length === 0 && !coords)

/** Where the shopper chose to shop and the range, for the product offers list. */
export function areaParams({ blockIds = [], coords = null, range = 'block' }) {
  const ids = asBlockIds(blockIds)
  if (ids.length === 0) return null
  return {
    blockIds: ids.join(','),
    ...(coords && { lat: coords.lat, lng: coords.lng }),
    ...(isRadius(range) && coords && { radiusKm: range }),
  }
}

export async function fetchDiscover(query) {
  const res = await api.get('/discover', { params: query })
  return { items: res.data.items || [], pagination: res.data.pagination, meta: res.data.meta }
}

export async function fetchBlocks(cityId) {
  const res = await api.get('/blocks', { params: { cityId, isActive: true } })
  return Array.isArray(res.data?.blocks) ? res.data.blocks : []
}

/**
 * "Which blocks am I in?" for a position (a device fix or a dropped pin).
 * Returns the blocks whose boundary holds it and the nearest others to offer.
 */
export async function resolvePoint(position) {
  const res = await api.get('/blocks/at', { params: position })
  return {
    containing: Array.isArray(res.data?.containing) ? res.data.containing : [],
    nearest: Array.isArray(res.data?.nearest) ? res.data.nearest : [],
  }
}

/**
 * "Find me": position, then the server says which blocks hold it.
 *   { status: 'found' | 'overlap' | 'border' | 'outside', coords, containing, nearest }
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
    const { containing, nearest } = await resolvePoint(coords)
    if (containing.length > 0) {
      return { status: containing.length > 1 ? 'overlap' : 'found', coords, containing, nearest }
    }
    if (nearest.length > 0) return { status: 'border', coords, containing, nearest }
    return { status: 'outside', coords, containing, nearest }
  } catch {
    return { status: 'error', coords, containing: [], nearest: [], canAskAgain: true }
  }
}
