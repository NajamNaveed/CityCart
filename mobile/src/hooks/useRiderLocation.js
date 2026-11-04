import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { fetchRiderLocation } from '../services/orders'
import { getErrorMessage } from '../services/api'

// The rider reports every 30 seconds; asking a little more often keeps the dot moving
// without turning a delivered order into a stream of requests.
export const RIDER_POLL_MS = 15000

/**
 * The rider's shared position while their order is out for delivery (docs/11 §30).
 * Polls on focus and stops as soon as the page is left; the last position stays
 * on screen if a later read fails. `location` is null when the rider is not
 * sharing (or the server has nothing fresh to show), never "where they were".
 */
export function useRiderLocation(deliveryId) {
  const [state, setState] = useState({ location: null, error: '', checkedAt: null, everShown: false })

  useFocusEffect(
    useCallback(() => {
      if (!deliveryId) return undefined
      let active = true
      let timer = null
      async function ask() {
        try {
          const location = await fetchRiderLocation(deliveryId)
          if (active) setState((now) => ({ location, error: '', checkedAt: new Date(), everShown: now.everShown || Boolean(location) }))
        } catch (err) {
          if (active) setState((now) => ({ ...now, error: getErrorMessage(err) }))
        }
        if (active) timer = setTimeout(ask, RIDER_POLL_MS)
      }
      ask()
      return () => {
        active = false
        if (timer) clearTimeout(timer)
      }
    }, [deliveryId]),
  )

  return state
}
