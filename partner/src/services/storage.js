import * as SecureStore from 'expo-secure-store'

// Its own key: this app and the shopper app can sit on the same phone, and one
// must never pick up the other's session.
const TOKEN_KEY = 'citycart.partner.session'

/**
 * The login token lives only in the device's secure storage (iOS Keychain /
 * Android Keystore), never in plain storage. It is also kept in memory so each
 * request does not wait on the keychain. "THIS_DEVICE_ONLY" keeps it out of
 * backups, so a restored phone signs in again instead of inheriting a session.
 */
let memoryToken = null

export const tokenStore = {
  // Called once at startup, before the first request.
  async load() {
    try {
      memoryToken = (await SecureStore.getItemAsync(TOKEN_KEY)) || null
    } catch {
      memoryToken = null
    }
    return memoryToken
  },
  get() {
    return memoryToken
  },
  async set(token) {
    memoryToken = token
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  },
  async clear() {
    memoryToken = null
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY)
    } catch {
      /* nothing stored */
    }
  },
}
