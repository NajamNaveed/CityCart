import { useEffect } from 'react'
import { createLocationSharer, ensureLocationPermission, sendPosition, startWatching, stopSharingOnServer } from '../services/location'
import { getShareLocation, loadPrefs, subscribeShareLocation } from '../services/prefs'

/**
 * Keeps the rider's position flowing to the server while (and only while) they have switched sharing
 * on and the app is open. Mounted once, in the rider's tabs. Turning the switch off, or signing out
 * (the tabs unmount), stops it and asks the server to forget the position.
 */
export function useLocationSharing() {
  useEffect(() => {
    let stopWatching = null
    let cancelled = false

    async function begin() {
      if (stopWatching) return
      try {
        if (!(await ensureLocationPermission()) || cancelled) return
        const sharer = createLocationSharer({ send: sendPosition })
        const stop = await startWatching((coords) => sharer(coords))
        if (cancelled || !getShareLocation()) {
          stop()
          return
        }
        stopWatching = stop
      } catch {
        /* location is unavailable on this phone: sharing simply does not start */
      }
    }

    function end() {
      if (!stopWatching) return
      stopWatching()
      stopWatching = null
      stopSharingOnServer()
    }

    loadPrefs().then(() => {
      if (!cancelled && getShareLocation()) begin()
    })
    const unsubscribe = subscribeShareLocation((on) => (on ? begin() : end()))

    return () => {
      cancelled = true
      unsubscribe()
      end()
    }
  }, [])
}
