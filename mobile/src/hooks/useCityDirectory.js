import { useEffect, useState } from 'react'
import api from '../services/api'

// The map's "All" layer means the whole city, not the filtered page of results
// behind it. One capped city-wide request fills that layer; the list and the
// rest of the screen keep their own filtered query.
export const CITY_DIRECTORY_LIMIT = 30

export function useCityDirectory({ cityId, kind, enabled, q = '', categoryId = '' }) {
  const key = `${kind}|${cityId}|${q}|${categoryId}`
  const [state, setState] = useState({ key: '', items: null })

  useEffect(() => {
    if (!enabled || !cityId) return undefined
    let active = true
    const path = kind === 'providers' ? '/services/discover' : '/discover'
    api
      .get(path, {
        params: {
          cityId,
          scope: 'city',
          limit: CITY_DIRECTORY_LIMIT,
          ...(q && { q }),
          ...(categoryId && { categoryId }),
        },
      })
      .then(({ data }) => active && setState({ key, items: Array.isArray(data?.items) ? data.items : [] }))
      .catch(() => active && setState({ key, items: [] }))
    return () => {
      active = false
    }
  }, [key, cityId, kind, enabled, q, categoryId])

  return state.key === key ? state.items : null
}
