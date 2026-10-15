import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TOKEN_KEY = 'citycart.session'

/**
 * The login token lives only in the device's secure storage (iOS Keychain /
 * Android Keystore), never in AsyncStorage, which is plain and readable. It
 * is also kept in memory so each request does not wait on the keychain.
 * "THIS_DEVICE_ONLY" keeps it out of backups, so a restored phone signs in
 * again instead of inheriting a session.
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

// Non-secret choices (city, block, search range). Never put a token here.
export const prefs = {
  async get(key, fallback = null) {
    try {
      const raw = await AsyncStorage.getItem(`citycart.${key}`)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },
  async set(key, value) {
    try {
      await AsyncStorage.setItem(`citycart.${key}`, JSON.stringify(value))
    } catch {
      /* the choice just will not persist */
    }
  },
  async remove(key) {
    try {
      await AsyncStorage.removeItem(`citycart.${key}`)
    } catch {
      /* nothing stored */
    }
  },
}
