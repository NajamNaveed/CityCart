import { useCallback, useRef, useState } from 'react'
import api from '../services/api'
import { boundsOfBlocks } from '../utils/geo'
import { useCity } from './useCity'

// Framing the map on a city is a view-only change: it swaps the active city
// (and its results) but never touches the shopper's saved spot. The bounds are
// read from that city's blocks, so the map shows the whole city rather than a
// single marker.
export function useMapFocus(blocks = []) {
  const { cityId, setCityId } = useCity()
  const [focus, setFocus] = useState(null)
  const wanted = useRef('')

  const chooseCity = useCallback(
    async (nextId) => {
      if (!nextId) return
      wanted.current = nextId

      if (nextId === cityId) {
        const bounds = boundsOfBlocks(blocks)
        if (bounds) setFocus({ key: `${nextId}:${Date.now()}`, bounds })
        return
      }

      setCityId(nextId)
      try {
        const { data } = await api.get('/blocks', { params: { cityId: nextId, isActive: true } })
        if (wanted.current !== nextId) return
        const bounds = boundsOfBlocks(data.blocks || [])
        if (bounds) setFocus({ key: `${nextId}:${Date.now()}`, bounds })
      } catch {
        /* the new city's results will frame the map instead */
      }
    },
    [blocks, cityId, setCityId],
  )

  return { focus, chooseCity }
}
