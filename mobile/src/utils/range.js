// How far the shopper is searching: 'block' (their own block), 'city' (the whole
// city), or a radius in kilometres as a string such as '5' or '7.5'.
// The same rules as the web app.
export const MIN_RADIUS_KM = 0.5
export const MAX_RADIUS_KM = 50

export const isRadius = (range) => /^\d+(\.\d+)?$/.test(range)

// Anything unknown or out of bounds falls back to 'block'.
export function normalizeRange(range) {
  if (range === 'block' || range === 'city') return range
  const km = Number(range)
  return Number.isFinite(km) && km >= MIN_RADIUS_KM && km <= MAX_RADIUS_KM ? String(km) : 'block'
}

// The next wider choice, offered when a search finds nothing; null once it is the whole city.
const STEPS = [2, 5, 10, 20, 50]
export function nextRange(range) {
  if (range === 'block') return '5'
  if (isRadius(range)) {
    const bigger = STEPS.find((km) => km > Number(range))
    return bigger ? String(bigger) : 'city'
  }
  return null
}

export const rangeLabel = (range) => (range === 'city' ? 'the whole city' : isRadius(range) ? `${range} km` : 'this block')
