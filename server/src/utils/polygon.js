/**
 * Polygon helpers for block zones (Marketplace v2, Phase 2, docs/22).
 *
 * A ring is an array of [lat, lng] pairs, OPEN (the first point is not repeated
 * at the end). GeoJSON stores [lng, lat] and CLOSES the ring; `toGeoJsonPolygon`
 * and `ringFromGeoJson` convert between the two.
 *
 * Zones are small (a neighbourhood), so planar maths on an equirectangular
 * projection is accurate enough for validation and point-in-polygon.
 */
const MIN_POINTS = 3;
const MAX_POINTS = 100;
// Anything smaller is a sliver nobody can stand in; anything larger is not a neighbourhood.
const MIN_AREA_KM2 = 0.01;
const MAX_AREA_KM2 = 1000;
const KM_PER_DEGREE = 111.32;

const isSamePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

/** Drops a repeated closing point if the caller sent one. */
function normalizeRing(points) {
  if (points.length > 1 && isSamePoint(points[0], points[points.length - 1])) {
    return points.slice(0, -1);
  }
  return points;
}

/** Project to kilometres around a reference latitude/longitude. */
function projector(refLat, refLng) {
  const cos = Math.cos((refLat * Math.PI) / 180);
  return ([lat, lng]) => [(lng - refLng) * KM_PER_DEGREE * cos, (lat - refLat) * KM_PER_DEGREE];
}

function signedAreaKm2(ring) {
  const project = projector(ring[0][0], ring[0][1]);
  const pts = ring.map(project);
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

const areaKm2 = (ring) => Math.abs(signedAreaKm2(ring));

function orientation(a, b, c) {
  const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    Math.min(a[0], c[0]) <= b[0] &&
    b[0] <= Math.max(a[0], c[0]) &&
    Math.min(a[1], c[1]) <= b[1] &&
    b[1] <= Math.max(a[1], c[1])
  );
}

/** True when segments p1p2 and p3p4 cross or touch. */
function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/** True when any two edges that are not neighbours cross or touch. */
function selfIntersects(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (!neighbours && segmentsIntersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks a list of [lat, lng] pairs. Returns { ok: true, ring, areaKm2 } with the
 * cleaned ring, or { ok: false, message } with a sentence an admin can act on.
 */
function validateRing(points) {
  if (!Array.isArray(points)) return { ok: false, message: 'polygon must be a list of points.' };
  const ring = normalizeRing(points);
  if (ring.length < MIN_POINTS) {
    return { ok: false, message: `A zone needs at least ${MIN_POINTS} corners.` };
  }
  if (ring.length > MAX_POINTS) {
    return { ok: false, message: `A zone can have at most ${MAX_POINTS} corners.` };
  }
  for (const point of ring) {
    const [lat, lng] = Array.isArray(point) ? point : [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, message: 'Every corner must be a valid [latitude, longitude].' };
    }
  }
  for (let i = 0; i < ring.length; i += 1) {
    if (isSamePoint(ring[i], ring[(i + 1) % ring.length])) {
      return { ok: false, message: 'Two neighbouring corners are in the same place. Remove the extra one.' };
    }
  }
  if (selfIntersects(ring)) {
    return { ok: false, message: 'The outline crosses itself. Redraw it so the edges do not cross.' };
  }
  const area = areaKm2(ring);
  if (area < MIN_AREA_KM2) {
    return { ok: false, message: 'The zone is too small. Make it larger.' };
  }
  if (area > MAX_AREA_KM2) {
    return { ok: false, message: 'The zone is too large for a neighbourhood.' };
  }
  return { ok: true, ring, areaKm2: area };
}

/** Ray casting. Points exactly on an edge may fall either way. */
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const crosses = lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * A point guaranteed to be inside the zone, used as its "centre" for sorting,
 * framing the map and as the default pin of a new shop. The centroid is used
 * when it is inside; for a concave shape it can fall outside, so the middle of
 * the widest stretch along the horizontal line through the middle is used instead.
 */
function innerPoint(ring) {
  const project = projector(ring[0][0], ring[0][1]);
  const pts = ring.map(project);
  const a = signedAreaKm2(ring);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const cos = Math.cos((ring[0][0] * Math.PI) / 180);
  const back = (x, y) => [ring[0][0] + y / KM_PER_DEGREE, ring[0][1] + x / (KM_PER_DEGREE * cos)];
  const centroid = back(cx / (6 * a), cy / (6 * a));
  if (pointInRing(centroid[0], centroid[1], ring)) {
    return { lat: centroid[0], lng: centroid[1] };
  }

  const lats = ring.map((p) => p[0]);
  const y = (Math.min(...lats) + Math.max(...lats)) / 2;
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    if (latI > y !== latJ > y) xs.push(lngI + ((y - latI) * (lngJ - lngI)) / (latJ - latI));
  }
  xs.sort((p, q) => p - q);
  let best = null;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
  }
  return best ? { lat: y, lng: (best[0] + best[1]) / 2 } : { lat: ring[0][0], lng: ring[0][1] };
}

/** GeoJSON Polygon, counter-clockwise (the GeoJSON convention), ring closed. */
function toGeoJsonPolygon(ring) {
  const ccw = signedAreaKm2(ring) >= 0 ? ring : [...ring].reverse();
  const coords = ccw.map(([lat, lng]) => [lng, lat]);
  coords.push(coords[0]);
  return { type: 'Polygon', coordinates: [coords] };
}

/** Back to the open [lat, lng] ring that clients draw. */
function ringFromGeoJson(polygon) {
  if (!polygon || !polygon.coordinates || !polygon.coordinates[0]) return null;
  return normalizeRing(polygon.coordinates[0].map(([lng, lat]) => [lat, lng]));
}

module.exports = {
  MIN_POINTS,
  MAX_POINTS,
  MIN_AREA_KM2,
  MAX_AREA_KM2,
  areaKm2,
  validateRing,
  pointInRing,
  innerPoint,
  toGeoJsonPolygon,
  ringFromGeoJson,
  selfIntersects,
};
