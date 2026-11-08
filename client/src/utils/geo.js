// Location helpers shared by the shopper's picker and the dashboards.

// Browser geolocation as a promise. Rejects with an Error whose `code` is
// 'UNSUPPORTED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT'. Coordinates are rounded
// to 4 decimals (~11 m): plenty for "which block am I in", and it keeps the
// precise position off the device's storage.
export function getDevicePosition({ timeout = 10000, maximumAge = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const fail = (code, message) => reject(Object.assign(new Error(message), { code }))
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      fail('UNSUPPORTED', 'This device cannot share its location.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: Math.round(coords.latitude * 1e4) / 1e4,
          lng: Math.round(coords.longitude * 1e4) / 1e4,
        }),
      (err) => {
        if (err.code === 1) fail('DENIED', 'Location permission was denied.')
        else if (err.code === 3) fail('TIMEOUT', 'Finding your location took too long.')
        else fail('UNAVAILABLE', 'Your location is not available right now.')
      },
      { enableHighAccuracy: false, timeout, maximumAge },
    )
  })
}

// "31.4186, 73.0790" (what Google Maps copies) or "31.4186 73.0790" -> { lat, lng }.
// Returns null for anything that isn't a valid latitude/longitude pair.
export function parseLatLng(text = '') {
  const match = String(text)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null
  return { lat, lng }
}

// 0.4 -> "400 m", 1.2 -> "1.2 km", null -> ''.
export function formatDistance(km) {
  if (km === null || km === undefined) return ''
  if (km < 0.1) return 'Under 100 m'
  if (km < 1) return `${Math.round(km * 10) * 100} m`
  return `${km} km`
}

// A block as the API returns it ({ latitude, longitude, ... }) -> { lat, lng }.
export function latLngOfBlock(block) {
  return { lat: block.latitude, lng: block.longitude }
}

// The rectangle enclosing every block of a city, so the map can frame the
// whole city rather than a single pin. Blocks without a drawn outline fall
// back to their centre point.
export function boundsOfBlocks(blocks = []) {
  const lats = []
  const lngs = []
  for (const block of blocks) {
    const ring = Array.isArray(block.polygon) ? block.polygon : []
    if (ring.length > 0) {
      for (const [lat, lng] of ring) {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          lats.push(lat)
          lngs.push(lng)
        }
      }
    } else if (Number.isFinite(block.latitude) && Number.isFinite(block.longitude)) {
      lats.push(block.latitude)
      lngs.push(block.longitude)
    }
  }
  if (lats.length === 0) return null
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  }
}

// A GeoJSON point from the API ([longitude, latitude]) -> { lat, lng }.
export function latLngOfGeoPoint(point) {
  const coordinates = point?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const [lng, lat] = coordinates.map(Number)
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null
  return { lat, lng }
}

// Ray casting: is { lat, lng } inside an open [lat, lng] ring from the API?
export function insidePolygon({ lat, lng }, ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside
  }
  return inside
}
