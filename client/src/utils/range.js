// Search range for nearby shopping: 'block' (own block), 'city' (whole city),
// or a radius in kilometres as a string, e.g. '5' or '7.5'.
export const MIN_RADIUS_KM = 0.5
export const MAX_RADIUS_KM = 50

export const isRadius = (range) => /^\d+(\.\d+)?$/.test(range)

// Anything unknown or out of bounds falls back to 'block'.
export function normalizeRange(range) {
  if (range === 'block' || range === 'city') return range
  const km = Number(range)
  return Number.isFinite(km) && km >= MIN_RADIUS_KM && km <= MAX_RADIUS_KM ? String(km) : 'block'
}
