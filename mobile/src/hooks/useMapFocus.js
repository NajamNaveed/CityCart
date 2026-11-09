import { useCallback, useRef, useState } from 'react'
import { fetchBlocks } from '../services/nearby'
import { boundsOfBlocks } from '../utils/geo'
import { useCity } from './useCity'

/**
 * Framing the map on a city is a view-only change: it swaps the active city
 * (and its results) but never touches the shopper's saved spot. Choosing the
 * city already shown re-frames it, which is what the recenter action uses.
 */
export function useMapFocus(blocks = []) {
  const { cityId, setCityId } = useCity()
  const [focus, setFocus] = useState(null)
  const wanted = useRef('')
  const count = useRef(0)

  const frame = useCallback((id, list) => {
    const bounds = boundsOfBlocks(list)
    if (!bounds) return
    count.current += 1
    setFocus({ key: `${id}:${count.current}`, bounds })
  }, [])

  const chooseCity = useCallback(
    async (nextId) => {
      if (!nextId) return
      wanted.current = nextId
      if (nextId === cityId) {
        frame(nextId, blocks)
        return
      }
      setCityId(nextId)
      try {
        const list = await fetchBlocks(nextId)
        if (wanted.current !== nextId) return
        frame(nextId, list)
      } catch {
        /* the new city's results will frame the map instead */
      }
    },
    [blocks, cityId, frame, setCityId],
  )

  return { focus, chooseCity }
}
