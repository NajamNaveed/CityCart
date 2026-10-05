import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Star ratings for a page of products, in one request: { [productId]: { average, count } }.
 * Products nobody has reviewed are simply missing from the result.
 */
export function useRatings(productIds) {
  const key = productIds.join(',')
  const [state, setState] = useState({ key: '', ratings: {} })

  useEffect(() => {
    if (!key) return undefined
    let active = true
    api
      .get('/reviews/summary', { params: { productIds: key } })
      .then((res) => active && setState({ key, ratings: res.data.ratings }))
      .catch(() => active && setState({ key, ratings: {} }))
    return () => {
      active = false
    }
  }, [key])

  return state.key === key ? state.ratings : {}
}