import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCity } from '../hooks/useCity'
import { fetchBlocks, locateShopper, normalizeStored } from '../services/nearby'
import { prefs } from '../services/storage'
import { normalizeRange } from '../utils/range'
import { NearbyContext } from './contexts'

const NO_BLOCKS = []

/**
 * The shopper's area: which block they are in, where exactly (when they shared
 * their position), and how far they want to search. Remembered on the phone
 * only; the server is only ever told a position for the one search it answers.
 */
export function NearbyProvider({ children }) {
  const { cityId, setCityId } = useCity()
  const [stored, setStored] = useState(() => normalizeStored(null))
  const [ready, setReady] = useState(false)
  // Treated as "already asked" until what was saved has been read, so a position
  // prompt can never appear before we know whether the shopper has seen it.
  const [asked, setAsked] = useState(true)
  const [status, setStatus] = useState('idle') // idle | detecting | found | denied | servicesOff | timeout | outside | error
  const [canAskAgain, setCanAskAgain] = useState(true)
  const [blocksState, setBlocksState] = useState({ cityId: '', list: NO_BLOCKS })
  const storedRef = useRef(stored)

  // At start: what was remembered.
  useEffect(() => {
    let active = true
    Promise.all([prefs.get('nearby', null), prefs.get('nearbyAsked', false)]).then(([saved, wasAsked]) => {
      if (!active) return
      const value = normalizeStored(saved)
      storedRef.current = value
      setStored(value)
      setAsked(wasAsked === true)
      setReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  // The blocks of the chosen city.
  useEffect(() => {
    if (!cityId) return undefined
    let active = true
    fetchBlocks(cityId)
      .then((list) => active && setBlocksState({ cityId, list }))
      .catch(() => active && setBlocksState({ cityId, list: NO_BLOCKS }))
    return () => {
      active = false
    }
  }, [cityId])

  const blocksReady = !cityId || blocksState.cityId === cityId
  const blocks = cityId && blocksState.cityId === cityId ? blocksState.list : NO_BLOCKS
  // A remembered block that is not in this city's list reads as "none".
  const block = blocks.find((b) => b._id === stored.blockId) || null

  const update = useCallback((patch) => {
    const next = { ...storedRef.current, ...patch }
    storedRef.current = next
    setStored(next)
    prefs.set('nearby', next)
  }, [])

  const setRange = useCallback((range) => update({ range: normalizeRange(range) }), [update])
  // Choosing a block by hand means "measure from the block", not from a phone position.
  const chooseBlock = useCallback((blockId) => update({ blockId, coords: null }), [update])
  const clearLocation = useCallback(() => update({ blockId: '', coords: null }), [update])

  const detect = useCallback(async () => {
    setStatus('detecting')
    setAsked(true)
    prefs.set('nearbyAsked', true)
    const result = await locateShopper()
    setCanAskAgain(result.canAskAgain !== false)
    if (result.status === 'found') {
      setCityId(result.city._id)
      update({ blockId: result.block._id, coords: result.coords })
    }
    setStatus(result.status)
    return result.status
  }, [setCityId, update])

  const value = useMemo(
    () => ({
      ready,
      asked,
      blocks,
      blocksReady,
      block,
      blockId: block ? block._id : '',
      coords: stored.coords,
      range: stored.range,
      status,
      canAskAgain,
      setRange,
      chooseBlock,
      clearLocation,
      detect,
    }),
    [ready, asked, blocks, blocksReady, block, stored.coords, stored.range, status, canAskAgain, setRange, chooseBlock, clearLocation, detect],
  )

  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>
}
