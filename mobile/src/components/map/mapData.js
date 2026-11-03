import { formatDistance } from '../../utils/geo'

const isCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)

/**
 * Everything the map needs, as plain JSON the WebView can receive.
 * The map draws zones, shop pins, the chosen pin and the radius circle.
 */
export function buildMapData({ items = [], zones = [], selectedIds = [], origin = null, pin = null, radiusKm = null, originLabel = '', pickable = false }) {
  const chosen = new Set(selectedIds.map(String))
  const shapes = zones
    .filter((zone) => Array.isArray(zone.polygon) && zone.polygon.length >= 3)
    .map((zone) => ({
      id: String(zone._id),
      name: zone.name || '',
      ring: zone.polygon.filter((point) => Array.isArray(point) && isCoord(point[0], point[1])),
      selected: chosen.has(String(zone._id)),
    }))
    .filter((zone) => zone.ring.length >= 3)

  const pins = []
  for (const brand of items) {
    for (const branch of brand.branches || []) {
      if (!isCoord(branch.latitude, branch.longitude)) continue
      pins.push({
        brandId: String(brand._id),
        brandName: brand.name || '',
        branchName: branch.name || '',
        where: [branch.blockName, branch.address].filter(Boolean).join(' · '),
        distance: branch.distanceKm == null ? '' : `${formatDistance(branch.distanceKm)} away`,
        lat: branch.latitude,
        lng: branch.longitude,
      })
    }
  }

  const shown = pin || origin
  const picked = isCoord(shown?.lat, shown?.lng)
    ? { lat: shown.lat, lng: shown.lng, label: originLabel || (pin ? 'Delivery spot' : 'Search centre') }
    : null

  return {
    zones: shapes,
    pins,
    pin: picked,
    radiusKm: Number(radiusKm) || 0,
    pickable: Boolean(pickable),
  }
}
