// Small product rules shared by the cards and the product page (same as the web app).

// "20% off", or 0 when there is no real discount.
export function discountPercent(product) {
  const { price, compareAtPrice } = product || {}
  return compareAtPrice && compareAtPrice > price ? Math.round((1 - price / compareAtPrice) * 100) : 0
}

// What to say about stock. `tone` picks the colour: 'good' | 'warn' | 'bad'.
export function availabilityInfo(product) {
  if (product?.availability === 'OUT_OF_STOCK') return { label: 'Sold out', tone: 'bad', soldOut: true }
  if (product?.availability === 'LOW_STOCK') return { label: 'Only a few left', tone: 'warn', soldOut: false }
  return { label: 'In stock', tone: 'good', soldOut: false }
}

// "Sana Iqbal" -> "S", for the round avatar next to a review.
export const initial = (name = '') => (name.trim()[0] || '?').toUpperCase()

// Brand logo fallback: "Loom & Co." -> "LC".
export function monogram(name = '') {
  const letters = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
  return letters || '?'
}

export function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
