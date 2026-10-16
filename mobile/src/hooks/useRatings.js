import { useEffect, useRef, useState } from 'react'
import { fetchRatings } from '../services/catalog'

const CHUNK = 24

/**
 * Star ratings for the products on screen: { [productId]: { average, count } }.
 * Only products not asked about yet are requested, so scrolling to a new page
 * costs one small request, not a repeat of everything already loaded.
 */
export function useRatings(products) {
  const [ratings, setRatings] = useState({})
  const asked = useRef(new Set())
  const ids = products.map((p) => p._id).join(',')

  useEffect(() => {
    const missing = ids ? ids.split(',').filter((id) => !asked.current.has(id)) : []
    missing.forEach((id) => asked.current.add(id))
    for (let i = 0; i < missing.length; i += CHUNK) {
      fetchRatings(missing.slice(i, i + CHUNK))
        .then((found) => setRatings((prev) => ({ ...prev, ...found })))
        .catch(() => {
          // Try these again next time they appear; ratings are a nicety, not a blocker.
          missing.slice(i, i + CHUNK).forEach((id) => asked.current.delete(id))
        })
    }
  }, [ids])

  return ratings
}
