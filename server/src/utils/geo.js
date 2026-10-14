/**
 * Small geo helpers (no external dependency).
 *
 * MongoDB stores points as GeoJSON `[longitude, latitude]` (longitude FIRST).
 * Everything else in this codebase talks `{ lat, lng }`, so these helpers are
 * the only place the two orders are converted.
 */
const EARTH_RADIUS_KM = 6371;
// MongoDB's $centerSphere takes a radius in radians. The MongoDB docs divide
// by 6378.1 (the equatorial radius), so the same constant is used here.
const MONGO_EARTH_RADIUS_KM = 6378.1;

const toRad = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres between two `{ lat, lng }` points. */
function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointFromLatLng(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] };
}

function latLngFromPoint(point) {
  return { lat: point.coordinates[1], lng: point.coordinates[0] };
}

/** One decimal place is plenty for "1.2 km away". */
const roundKm = (km) => Math.round(km * 10) / 10;

module.exports = {
  EARTH_RADIUS_KM,
  MONGO_EARTH_RADIUS_KM,
  distanceKm,
  pointFromLatLng,
  latLngFromPoint,
  roundKm,
};
