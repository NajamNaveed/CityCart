// 0.04 -> "Under 100 m", 0.46 -> "500 m", 1.2 -> "1.2 km", null -> ''.
export function formatDistance(km) {
  if (km === null || km === undefined) return ''
  if (km < 0.1) return 'Under 100 m'
  if (km < 1) return `${Math.round(km * 10) * 100} m`
  return `${km} km`
}

// Four decimals is about 11 metres: plenty to find the right block, and the
// precise position is never kept.
export const roundCoord = (value) => Math.round(value * 1e4) / 1e4

// A link that opens the phone's maps app (or the browser) at a shop. It needs no
// map key and no extra package, so "directions" works even where the in-app map cannot.
export function mapsUrl({ latitude, longitude }, label = '') {
  const query = `${latitude},${longitude}`
  const base = 'https://www.google.com/maps/search/?api=1'
  return label ? `${base}&query=${encodeURIComponent(label)}%20${encodeURIComponent(query)}` : `${base}&query=${encodeURIComponent(query)}`
}

export const isValidLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
