jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { prefs, tokenStore } from '../src/services/storage'

beforeEach(async () => {
  jest.clearAllMocks()
  SecureStore.deleteItemAsync.mockResolvedValue(undefined)
  await tokenStore.clear()
  jest.clearAllMocks()
  await AsyncStorage.clear()
})

describe('tokenStore', () => {
  it('keeps the token only in secure storage, locked to this device, and in memory', async () => {
    await tokenStore.set('abc.def.ghi')

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('citycart.session', 'abc.def.ghi', {
      keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    })
    expect(tokenStore.get()).toBe('abc.def.ghi')
    // never in the plain storage used for preferences
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('loads a saved token at startup', async () => {
    SecureStore.getItemAsync.mockResolvedValue('saved.token')
    expect(await tokenStore.load()).toBe('saved.token')
    expect(tokenStore.get()).toBe('saved.token')
  })

  it('treats nothing saved, or an unreadable keychain, as signed out', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null)
    expect(await tokenStore.load()).toBeNull()

    SecureStore.getItemAsync.mockRejectedValue(new Error('keychain locked'))
    expect(await tokenStore.load()).toBeNull()
    expect(tokenStore.get()).toBeNull()
  })

  it('clears memory and storage, even if deleting fails', async () => {
    await tokenStore.set('abc')
    SecureStore.deleteItemAsync.mockRejectedValue(new Error('nothing there'))

    await expect(tokenStore.clear()).resolves.toBeUndefined()

    expect(tokenStore.get()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('citycart.session')
  })
})

describe('prefs (non-secret choices)', () => {
  it('stores and returns JSON under a citycart. prefix', async () => {
    await prefs.set('range', { km: 5 })
    expect(await prefs.get('range')).toEqual({ km: 5 })
    expect(await AsyncStorage.getItem('citycart.range')).toBe('{"km":5}')
  })

  it('falls back when nothing is stored or the stored value is damaged', async () => {
    expect(await prefs.get('missing', 'fallback')).toBe('fallback')
    await AsyncStorage.setItem('citycart.broken', '{not json')
    expect(await prefs.get('broken', 'fallback')).toBe('fallback')
  })

  it('removes values', async () => {
    await prefs.set('city', 'abc')
    await prefs.remove('city')
    expect(await prefs.get('city')).toBeNull()
  })
})
