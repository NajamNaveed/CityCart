import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCity } from '../hooks/useCity'
import { fetchBlocks, locateShopper, normalizeStored, resolveAt } from '../services/nearby'
import { prefs } from '../services/storage'
import { normalizeRange } from '../utils/range'
import { NearbyContext } from './contexts'

const NO_BLOCKS = []
const NO_CHOICES = { containing: [], nearest: [] }

/**
 * The shopper's area: the block they are shopping in (or several, where zones overlap),
 * where exactly (a phone position or a pin they dropped) and how far they want to search.
 * Remembered on the phone only; the server is only ever told a position for the one
 * search it answers.
 *
 * Where the shopper is decides the blocks:
 *   inside one zone       -> that block, automatically
 *   inside an overlap     -> every block there, all ticked; the shopper may untick
 *   between/outside zones -> nothing yet; the nearest blocks are offered to choose from
 */
export function NearbyProvider({ children }) {
  const { cityId, setCityId } = useCity()
  const [stored, setStored] = useState(() => normalizeStored(null))
  const [ready, setReady] = useState(false)
  // Treated as "already asked" until what was saved has been read, so a position
  // prompt can never appear before we know whether the shopper has seen it.
  const [asked, setAsked] = useState(true)
  const [status, setStatus] = useState('idle') // idle | detecting | found | overlap | border | denied | servicesOff | timeout | outside | error
  const [canAskAgain, setCanAskAgain] = useState(true)
  const [choices, setChoices] = useState(NO_CHOICES)
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
  const selectedBlocks = useMemo(() => stored.blockIds.map((id) => blocks.find((b) => b._id === id)).filter(Boolean), [blocks, stored.blockIds])
  const blockIds = useMemo(() => selectedBlocks.map((b) => b._id), [selectedBlocks])
  const areaName = selectedBlocks.map((b) => b.name).join(' + ')
  // Where a range is measured from: the phone's position or the pin, else the centre of the one block chosen.
  const origin = useMemo(
    () => stored.coords || (selectedBlocks.length === 1 ? { lat: selectedBlocks[0].latitude, lng: selectedBlocks[0].longitude } : null),
    [stored.coords, selectedBlocks],
  )

  const update = useCallback((patch) => {
    const next = { ...storedRef.current, ...patch }
    storedRef.current = next
    setStored(next)
    prefs.set('nearby', next)
  }, [])

  const setRange = useCallback((range) => update({ range: normalizeRange(range) }), [update])

  // Picking blocks by hand means "measure from the blocks", not from a phone position or a pin.
  const chooseBlock = useCallback((blockId) => update({ blockIds: [blockId], coords: null, pinned: false }), [update])
  const toggleManualBlock = useCallback(
    (blockId) => {
      const current = storedRef.current.blockIds
      const ids = current.includes(blockId) ? current.filter((id) => id !== blockId) : [...current, blockId].slice(0, 10)
      update({ blockIds: ids, coords: null, pinned: false })
    },
    [update],
  )
  // Ticking a block among those offered for the shopper's position keeps the position.
  const toggleBlock = useCallback(
    (blockId) => {
      const current = storedRef.current.blockIds
      if (current.includes(blockId) && current.length === 1) return // at least one stays ticked
      update({ blockIds: current.includes(blockId) ? current.filter((id) => id !== blockId) : [...current, blockId].slice(0, 10) })
    },
    [update],
  )
  const clearLocation = useCallback(() => {
    update({ blockIds: [], coords: null, pinned: false })
    setChoices(NO_CHOICES)
    setStatus('idle')
  }, [update])

  // Applies the answer to "which blocks is this position in?".
  const apply = useCallback(
    (result, pinned) => {
      setChoices({ containing: result.containing || [], nearest: result.nearest || [] })
      if (result.status === 'found' || result.status === 'overlap') {
        setCityId(result.containing[0].cityId)
        update({ blockIds: result.containing.map((b) => b._id), coords: result.coords, pinned })
      } else if (result.status === 'border') {
        setCityId(result.nearest[0].cityId)
        update({ blockIds: [], coords: result.coords, pinned })
      }
      setStatus(result.status)
      return result.status
    },
    [setCityId, update],
  )

  const detect = useCallback(async () => {
    setStatus('detecting')
    setAsked(true)
    prefs.set('nearbyAsked', true)
    const result = await locateShopper()
    setCanAskAgain(result.canAskAgain !== false)
    return apply(result, false)
  }, [apply])

  // The shopper dropped a pin on the map: shop (and deliver) there instead of where they are.
  const setPin = useCallback(
    async (lat, lng) => {
      setStatus('detecting')
      const result = await resolveAt({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })
      return apply(result, true)
    },
    [apply],
  )

  const value = useMemo(
    () => ({
      ready,
      asked,
      blocks,
      blocksReady,
      selectedBlocks,
      blockIds,
      areaName,
      // Older single-block callers.
      block: selectedBlocks[0] || null,
      blockId: blockIds[0] || '',
      coords: stored.coords,
      pinned: stored.pinned,
      origin,
      range: stored.range,
      choices,
      status,
      canAskAgain,
      setRange,
      chooseBlock,
      toggleBlock,
      toggleManualBlock,
      clearLocation,
      detect,
      setPin,
    }),
    [ready, asked, blocks, blocksReady, selectedBlocks, blockIds, areaName, stored.coords, stored.pinned, origin, stored.range, choices, status, canAskAgain, setRange, chooseBlock, toggleBlock, toggleManualBlock, clearLocation, detect, setPin],
  )

  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>
}
