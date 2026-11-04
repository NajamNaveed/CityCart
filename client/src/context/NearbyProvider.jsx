import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { getDevicePosition, latLngOfBlock } from '../utils/geo'
import { normalizeRange } from '../utils/range'
import { useCity } from '../hooks/useCity'
import { NearbyContext } from './contexts'

const NO_BLOCKS = []
const STORAGE_KEY = 'citycart.nearby'
const ASKED_KEY = 'citycart.nearby.asked'

function readStored() {
  const empty = { blockIds: [], coords: null, pinned: false, range: 'block' }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return empty
    const { lat, lng } = raw.coords || {}
    // An older version kept a single block id.
    const ids = Array.isArray(raw.blockIds) ? raw.blockIds : typeof raw.blockId === 'string' && raw.blockId ? [raw.blockId] : []
    return {
      blockIds: ids.filter((id) => typeof id === 'string').slice(0, 10),
      coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      pinned: raw.pinned === true,
      range: normalizeRange(raw.range),
    }
  } catch {
    return empty
  }
}

const readAsked = () => {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}

const markAsked = () => {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    /* private mode: we may ask again next visit */
  }
}

// The shopper's area: the block (or several, where zones overlap) they are shopping
// in, where exactly (a device fix or a pin they dropped), and how far they want to
// search. Kept on this device only; the server never stores it.
//
// Where the shopper is decides the blocks:
//   inside one zone      -> that block, automatically
//   inside an overlap    -> every block there, all ticked; the shopper may untick
//   between/outside zones -> nothing yet; the nearest blocks are offered to choose from
export function NearbyProvider({ children }) {
  const { cityId, setCityId } = useCity()
  const [stored, setStored] = useState(readStored)
  const [blocksState, setBlocksState] = useState({ cityId: '', list: [] })
  // The last "which blocks am I in?" answer: the blocks holding the position, and the nearest others.
  const [choices, setChoices] = useState({ containing: [], nearest: [] })
  const [status, setStatus] = useState('idle') // idle | detecting | found | overlap | border | outside | denied | nodevice | error
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (!cityId) return undefined
    let active = true
    api
      .get('/blocks', { params: { cityId, isActive: true } })
      .then((res) => active && setBlocksState({ cityId, list: Array.isArray(res.data?.blocks) ? res.data.blocks : [] }))
      .catch(() => active && setBlocksState({ cityId, list: [] }))
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
    setStored((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* private mode: the choice just won't persist */
      }
      return next
    })
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
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* private mode */
        }
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
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* private mode */
        }
        return next
      }),
    [],
  )
  const clearLocation = useCallback(() => {
    update({ blockIds: [], coords: null, pinned: false })
    setStatus('idle')
    setChoices({ containing: [], nearest: [] })
  }, [update])

  // "Which blocks am I in?" for a position (a device fix, or a pin the shopper dropped).
  const resolveAt = useCallback(
    async (position, pinned) => {
      try {
        const { data } = await api.get('/blocks/at', { params: position })
        const containing = Array.isArray(data.containing) ? data.containing : []
        const nearest = Array.isArray(data.nearest) ? data.nearest : []
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
      } catch {
        setStatus('error')
        return 'error'
      }
    },
    [setCityId, update],
  )

  const detect = useCallback(async () => {
    setStatus('detecting')
    markAsked()
    let position
    try {
      position = await getDevicePosition()
    } catch (err) {
      const next = err.code === 'DENIED' ? 'denied' : err.code === 'UNSUPPORTED' ? 'nodevice' : 'error'
      setStatus(next)
      return next
    }
    return resolveAt(position, false)
  }, [resolveAt])

  // The shopper dropped a pin on the map: shop (and deliver) there instead of where they are.
  const setPin = useCallback(
    (lat, lng) => {
      setStatus('detecting')
      return resolveAt({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 }, true)
    },
    [resolveAt],
  )

  // First visit only: ask for the device location once, unless the shopper has
  // already chosen an area or the browser has location blocked outright.
  const autoDetect = useCallback(async () => {
    if (readAsked() || stored.blockIds.length > 0) return
    markAsked()
    try {
      const permission = await navigator.permissions?.query({ name: 'geolocation' })
      if (permission?.state === 'denied') return
    } catch {
      /* Permissions API unavailable: just try */
    }
    detect()
  }, [detect, stored.blockIds.length])

  const value = useMemo(
    () => ({
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
      pickerOpen,
      setRange,
      chooseBlock,
      toggleBlock,
      toggleManualBlock,
      clearLocation,
      detect,
      setPin,
      autoDetect,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
    }),
    [blocks, blocksReady, selectedBlocks, blockIds, areaName, stored.coords, stored.pinned, origin, stored.range, choices, status, pickerOpen, setRange, chooseBlock, toggleBlock, toggleManualBlock, clearLocation, detect, setPin, autoDetect],
  )

  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>
}
