import * as SecureStore from 'expo-secure-store'

/**
 * Small settings kept on the phone. They are not secrets, but secure storage is already part of
 * the app, so no extra package is needed. (A setting is per phone, not per account: signing out
 * turns location sharing off, see AuthProvider.)
 */
const SHARE_LOCATION_KEY = 'citycart.partner.shareLocation'

let shareLocation = false
const listeners = new Set()

export async function loadPrefs() {
  try {
    shareLocation = (await SecureStore.getItemAsync(SHARE_LOCATION_KEY)) === '1'
  } catch {
    shareLocation = false
  }
  return { shareLocation }
}

export const getShareLocation = () => shareLocation

export async function setShareLocation(value) {
  shareLocation = Boolean(value)
  listeners.forEach((listener) => listener(shareLocation))
  try {
    if (shareLocation) await SecureStore.setItemAsync(SHARE_LOCATION_KEY, '1')
    else await SecureStore.deleteItemAsync(SHARE_LOCATION_KEY)
  } catch {
    /* the setting still applies until the app closes */
  }
}

// Lets the sharing hook react at once when the switch on the Account screen changes.
export function subscribeShareLocation(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
