import * as Location from 'expo-location'
import api from './api'

/**
 * Sharing the rider's position while delivering (docs/11 §30, docs/20 §5.7). The rules:
 *  - it is the rider's choice (a switch on the Account screen, off by default);
 *  - it works only while the app is open (no background tracking, no extra store permissions);
 *  - the server accepts a position only while a delivery is out, and keeps just the last one.
 */

// While nothing is out for delivery the server answers 409 NO_ACTIVE_DELIVERY; stay quiet for a while
// instead of asking every few seconds.
export const IDLE_MS = 60 * 1000

/** Decides what to do with each new position. Pure, so it is tested without a phone. */
export function createLocationSharer({ send, now = Date.now, idleMs = IDLE_MS }) {
  let idleUntil = 0
  return async function onPosition(coords) {
    if (now() < idleUntil) return 'idle'
    try {
      await send({ latitude: coords.latitude, longitude: coords.longitude, ...(typeof coords.accuracy === 'number' && { accuracy: coords.accuracy }) })
      return 'sent'
    } catch (err) {
      if (err?.response?.data?.code === 'NO_ACTIVE_DELIVERY') {
        idleUntil = now() + idleMs
        return 'idle'
      }
      return 'failed'
    }
  }
}

export const sendPosition = (point) => api.put('/rider/deliveries/location', point)
export const stopSharingOnServer = () => api.delete('/rider/deliveries/location').catch(() => {})

/** true when the rider has allowed location while using the app (asks once). */
export async function ensureLocationPermission() {
  const current = await Location.getForegroundPermissionsAsync()
  if (current.status === 'granted') return true
  const asked = await Location.requestForegroundPermissionsAsync()
  return asked.status === 'granted'
}

/** Starts reporting about every 30 seconds (or 25 metres). Returns a function that stops it. */
export async function startWatching(onCoords) {
  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 30 * 1000, distanceInterval: 25 },
    (position) => onCoords(position.coords),
  )
  return () => subscription.remove()
}
