import * as Location from 'expo-location'
import { roundCoord } from '../utils/geo'

/**
 * Where is the shopper right now? Asks permission only when needed, and turns
 * every way this can go wrong into a plain code the screen can explain:
 *   DENIED       permission refused (`canAskAgain` says whether the system will ask again)
 *   SERVICES_OFF the phone's location switch is off
 *   TIMEOUT      no fix within the time limit
 *   UNAVAILABLE  anything else
 */
export class LocationError extends Error {
  constructor(code, message, { canAskAgain = true } = {}) {
    super(message)
    this.code = code
    this.canAskAgain = canAskAgain
  }
}

const FIX_TIMEOUT_MS = 12000
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new LocationError('TIMEOUT', 'Finding your location took too long.')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function getShopperPosition({ timeoutMs = FIX_TIMEOUT_MS } = {}) {
  try {
    let permission = await Location.getForegroundPermissionsAsync()
    if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) {
      throw new LocationError('DENIED', 'Location permission was not given.', { canAskAgain: permission.canAskAgain !== false })
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new LocationError('SERVICES_OFF', 'Location is switched off on this phone.')
    }

    // A recent position is instant and good enough to find a block; only wait for a fresh one if there is none.
    const recent = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS, requiredAccuracy: 1000 }).catch(() => null)
    const fix = recent || (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeoutMs))
    return { lat: roundCoord(fix.coords.latitude), lng: roundCoord(fix.coords.longitude) }
  } catch (err) {
    if (err instanceof LocationError) throw err
    throw new LocationError('UNAVAILABLE', 'Your location is not available right now.')
  }
}
