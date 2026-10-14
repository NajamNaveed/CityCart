import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { getDevicePosition } from '../utils/geo'
import { normalizeRange } from '../utils/range'
import { useCity } from '../hooks/useCity'
import { NearbyContext } from './contexts'

const NO_BLOCKS = []
const STORAGE_KEY = 'citycart.nearby'
const ASKED_KEY = 'citycart.nearby.asked'

function readStored() {
  const empty = { blockId: '', coords: null, range: 'block' }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return empty
    const { lat, lng } = raw.coords || {}
    return {
      blockId: typeof raw.blockId === 'string' ? raw.blockId : '',
      coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
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

// The shopper's area: which block they are in, where exactly (when they shared
// their device location), and how far they want to search. Everything is kept
// on this device only — the server never stores it.
export function NearbyProvider({ children }) {
  const { cityId, setCityId } = useCity()
  const [stored, setStored] = useState(readStored)
  const [blocksState, setBlocksState] = useState({ cityId: '', list: [] })
  const [status, setStatus] = useState('idle') // idle | detecting | found | denied | outside | nodevice | error
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
  // A remembered block that is not in the current city's list reads as "none".
  const block = blocks.find((b) => b._id === stored.blockId) || null

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
  // Picking a block by hand means "measure from the block", not from a device fix.
  const chooseBlock = useCallback((blockId) => update({ blockId, coords: null }), [update])
  const clearLocation = useCallback(() => update({ blockId: '', coords: null }), [update])

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
    try {
      const { data } = await api.get('/blocks/resolve', { params: position })
      if (!data.block || !data.city) {
        setStatus('outside')
        return 'outside'
      }
      setCityId(data.city._id)
      update({ blockId: data.block._id, coords: position })
      setStatus('found')
      return 'found'
    } catch {
      setStatus('error')
      return 'error'
    }
  }, [setCityId, update])

  // First visit only: ask for the device location once, unless the shopper has
  // already chosen an area or the browser has location blocked outright.
  const autoDetect = useCallback(async () => {
    if (readAsked() || stored.blockId) return
    markAsked()
    try {
      const permission = await navigator.permissions?.query({ name: 'geolocation' })
      if (permission?.state === 'denied') return
    } catch {
      /* Permissions API unavailable: just try */
    }
    detect()
  }, [detect, stored.blockId])

  const value = useMemo(
    () => ({
      blocks,
      blocksReady,
      block,
      blockId: block ? block._id : '',
      coords: stored.coords,
      range: stored.range,
      status,
      pickerOpen,
      setRange,
      chooseBlock,
      clearLocation,
      detect,
      autoDetect,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
    }),
    [blocks, blocksReady, block, stored.coords, stored.range, status, pickerOpen, setRange, chooseBlock, clearLocation, detect, autoDetect],
  )

  return <NearbyContext.Provider value={value}>{children}</NearbyContext.Provider>
}
