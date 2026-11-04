import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCity } from '../hooks/useCity'
import { fetchBlocks, locateShopper, normalizeStored, resolvePoint } from '../services/nearby'
import { prefs } from '../services/storage'
import { latLngOfBlock } from '../utils/geo'
import { normalizeRange } from '../utils/range'
import { NearbyContext } from './contexts'

const NO_BLOCKS = []

/**
 * The shopper's area: the block (or several, where zones overlap) they are shopping
 * in, where exactly (a device fix or a pin they dropped), and how far they want to
 * search. Kept on this phone only; the server is only ever told a position for the
 * one search it answers.
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
  const [status, setStatus] = useState('idle') // idle | detecting | found | overlap | border | outside | denied | servicesOff | timeout | error
  const [canAskAgain, setCanAskAgain] = useState(true)
  const [blocksState, setBlocksState] = useState({ cityId: '', list: NO_BLOCKS })
  // The last "which blocks am I in?" answer: the blocks holding the position, and the nearest others.
  const [choices, setChoices] = useState({ containing: [], nearest: [] })
  const [pickerOpen, setPickerOpen] = useState(false)
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
  // Remembered blocks that are not in the current city's list simply read as "none".
  const selectedBlocks = useMemo(
    () => stored.blockIds.map((id) => blocks.find((b) => b._id === id)).filter(Boolean),
    [blocks, stored.blockIds],
  )
  const blockIds = useMemo(() => selectedBlocks.map((b) => b._id), [selectedBlocks])
  const areaName = selectedBlocks.map((b) => b.name).join(' + ')
  // Where to measure a range from: the shopper's position, or the centre of the one block chosen.
  const origin = stored.coords || (selectedBlocks.length === 1 ? latLngOfBlock(selectedBlocks[0]) : null)

  const update = useCallback((patch) => {
    const next = { ...storedRef.current, ...patch }
    storedRef.current = next
    setStored(next)
    prefs.set('nearby', next)
  }, [])

  const setRange = useCallback((range) => update({ range: normalizeRange(range) }), [update])

  // Picking blocks by hand means "measure from the blocks", not from a device fix or a pin.
  const chooseBlock = useCallback((blockId) => update({ blockIds: [blockId], coords: null, pinned: false }), [update])
  const toggleManualBlock = useCallback(
    (blockId) =>
      setStored((prev) => {
        const has = prev.blockIds.includes(blockId)
        const ids = has ? prev.blockIds.filter((id) => id !== blockId) : [...prev.blockIds, blockId].slice(0, 10)
        const next = { ...prev, blockIds: ids, coords: null, pinned: false }
        storedRef.current = next
        prefs.set('nearby', next)
        return next
      }),
    [],
  )
  // Ticking a block among those offered for the shopper's position keeps the position.
  const toggleBlock = useCallback(
    (blockId) =>
      setStored((prev) => {
        const has = prev.blockIds.includes(blockId)
        // An overlap needs at least one block left ticked.
        if (has && prev.blockIds.length === 1) return prev
        const ids = has ? prev.blockIds.filter((id) => id !== blockId) : [...prev.blockIds, blockId].slice(0, 10)
        const next = { ...prev, blockIds: ids }
        storedRef.current = next
        prefs.set('nearby', next)
        return next
      }),
    [],
  )
  const clearLocation = useCallback(() => {
    update({ blockIds: [], coords: null, pinned: false })
    setStatus('idle')
    setChoices({ containing: [], nearest: [] })
  }, [update])

  // Apply a "which blocks am I in?" answer: inside a zone, inside an overlap, or between zones.
  const applyChoice = useCallback(
    (result, position, pinned) => {
      const containing = Array.isArray(result.containing) ? result.containing : []
      const nearest = Array.isArray(result.nearest) ? result.nearest : []
      setChoices({ containing, nearest })
      if (containing.length > 0) {
        setCityId(containing[0].cityId)
        update({ blockIds: containing.map((b) => b._id), coords: position, pinned })
        const next = containing.length > 1 ? 'overlap' : 'found'
        setStatus(next)
        return next
      }
      if (nearest.length > 0) {
        setCityId(nearest[0].cityId)
        update({ blockIds: [], coords: position, pinned })
        setStatus('border')
        return 'border'
      }
      setStatus('outside')
      return 'outside'
    },
    [setCityId, update],
  )

  // "Which blocks am I in?" for a position (a device fix, or a pin the shopper dropped).
  const resolveAt = useCallback(
    async (position, pinned) => {
      try {
        return applyChoice(await resolvePoint(position), position, pinned)
      } catch {
        setStatus('error')
        return 'error'
      }
    },
    [applyChoice],
  )

  const detect = useCallback(async () => {
    setStatus('detecting')
    setAsked(true)
    prefs.set('nearbyAsked', true)
    const result = await locateShopper()
    setCanAskAgain(result.canAskAgain !== false)
    if (result.coords && result.containing) return applyChoice(result, result.coords, false)
    setStatus(result.status)
    return result.status
  }, [applyChoice])

  // The shopper dropped a pin on the map: shop (and deliver) there instead of where they are.
  const setPin = useCallback(
    (lat, lng) => {
      setStatus('detecting')
      return resolveAt({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 }, true)
    },
    [resolveAt],
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
      pickerOpen,
      setRange,
      chooseBlock,
      toggleBlock,
      toggleManualBlock,
      clearLocation,
      detect,
      setPin,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
    }),
    [ready, asked, blocks, blocksReady, selectedBlocks, blockIds, areaName, stored.coords, stored.pinned, origin, stored.range, choices, status, canAskAgain, pickerOpen, setRange, chooseBlock, toggleBlock, toggleManualBlock, clearLocation, detect, setPin],
  )

  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>
}
