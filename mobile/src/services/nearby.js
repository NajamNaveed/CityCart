import api from './api'
import { getShopperPosition } from './location'
import { isRadius, normalizeRange } from '../utils/range'

export const NEARBY_PAGE_SIZE = 10

/**
 * What is remembered between launches: the chosen blocks (one, or several where zones
 * overlap), the last position (a phone fix or a dropped pin), and the range.
 */
export function normalizeStored(raw) {
  const empty = { blockIds: [], coords: null, pinned: false, range: 'block' }
  if (!raw || typeof raw !== 'object') return empty
  const { lat, lng } = raw.coords || {}
  // An older version remembered a single block id.
  const ids = Array.isArray(raw.blockIds) ? raw.blockIds : typeof raw.blockId === 'string' && raw.blockId ? [raw.blockId] : []
  return {
    blockIds: ids.filter((id) => typeof id === 'string' && id).slice(0, 10),
    coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    pinned: raw.pinned === true,
    range: normalizeRange(raw.range),
  }
}

/**
 * The /discover request for what the shopper has chosen, or null when there is no city to
 * search in. `origin` is where a range is measured from: the phone's position or the pin, else
 * the centre of the one block chosen. Without a place to measure from the search covers the
 * whole block(s) and `needsArea` says so.
 */
export function discoverQuery({ cityId, blockIds = [], coords = null, origin = coords, range = 'block', q = '', page = 1 }) {
  if (!cityId) return null
  const text = String(q).trim()
  const base = { page, limit: NEARBY_PAGE_SIZE, ...(text && { q: text }) }
  // One or several chosen blocks, optionally within a range of the shopper.
  if (blockIds.length > 0 && range !== 'city') {
    return {
      ...base,
      scope: 'area',
      blockIds: blockIds.join(','),
      ...(origin && { lat: origin.lat, lng: origin.lng }),
      ...(isRadius(range) && origin && { radiusKm: range }),
    }
  }
  // Between blocks: a range around the shopper's position.
  if (isRadius(range) && coords) return { ...base, cityId, scope: 'radius', radiusKm: range, lat: coords.lat, lng: coords.lng }
  return { ...base, cityId, scope: 'city', ...(coords && { lat: coords.lat, lng: coords.lng }) }
}

export const needsArea = ({ range, blockIds = [], coords }) =>
  (range === 'block' && blockIds.length === 0) || (isRadius(range) && blockIds.length === 0 && !coords)

export async function fetchDiscover(query) {
  const res = await api.get('/discover', { params: query })
  return { items: res.data.items || [], pagination: res.data.pagination, meta: res.data.meta }
}

export async function fetchBlocks(cityId) {
  const res = await api.get('/blocks', { params: { cityId, isActive: true } })
  return Array.isArray(res.data?.blocks) ? res.data.blocks : []
}

export const CATALOG_PAGE_SIZE = 12

/** The /catalog/browse request for the products of a shopping area (one card per real product), or null with no area. */
export function browseQuery({ blockIds = [], origin = null, range = 'block', q = '', sort = 'name', page = 1 }) {
  if (blockIds.length === 0 || range === 'city') return null
  const text = String(q).trim()
  const nearest = sort === 'nearest' && origin
  return {
    blockIds: blockIds.join(','),
    sort: nearest ? 'nearest' : sort === 'price' ? 'price' : 'name',
    page,
    limit: CATALOG_PAGE_SIZE,
    ...(text && { q: text }),
    ...(origin && { lat: origin.lat, lng: origin.lng }),
    ...(origin && isRadius(range) && { radiusKm: range }),
  }
}

export async function fetchCatalogBrowse(query) {
  const res = await api.get('/catalog/browse', { params: query })
  return { items: res.data.items || [], pagination: res.data.pagination, meta: res.data.meta }
}

/**
 * "Which blocks is this position in?" The server answers with every block whose zone holds it
 * (none, one, or several where zones overlap) and the nearest others:
 *   { status: 'found', containing, nearest }    one block
 *   { status: 'overlap', containing, nearest }  several blocks: the shopper may keep one or all
 *   { status: 'border', containing: [], nearest } between zones: the shopper chooses
 *   { status: 'outside' }                        nowhere we serve
 *   { status: 'error' }
 */
export async function resolveAt(coords) {
  try {
    const res = await api.get('/blocks/at', { params: { lat: coords.lat, lng: coords.lng } })
    const containing = Array.isArray(res.data?.containing) ? res.data.containing : []
    const nearest = Array.isArray(res.data?.nearest) ? res.data.nearest : []
    if (containing.length > 0) return { status: containing.length > 1 ? 'overlap' : 'found', containing, nearest, coords }
    if (nearest.length > 0) return { status: 'border', containing, nearest, coords }
    return { status: 'outside' }
  } catch {
    return { status: 'error', canAskAgain: true }
  }
}

/**
 * "Find me": the phone's position, then the blocks it is in.
 *   the statuses of resolveAt, or { status: 'denied' | 'servicesOff' | 'timeout' | 'error', canAskAgain? }
 */
export async function locateShopper() {
  let coords
  try {
    coords = await getShopperPosition()
  } catch (err) {
    const status = { DENIED: 'denied', SERVICES_OFF: 'servicesOff', TIMEOUT: 'timeout' }[err.code] || 'error'
    return { status, canAskAgain: err.canAskAgain !== false }
  }
  return resolveAt(coords)
}
