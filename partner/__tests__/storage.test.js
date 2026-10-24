jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}))

import * as SecureStore from 'expo-secure-store'
import { tokenStore } from '../src/services/storage'

beforeEach(async () => {
  jest.clearAllMocks()
  SecureStore.deleteItemAsync.mockResolvedValue(undefined)
  await tokenStore.clear()
  jest.clearAllMocks()
})

describe('tokenStore', () => {
  it("keeps the token in secure storage under the partner app's OWN key, locked to this device", async () => {
    await tokenStore.set('abc.def.ghi')

    // Not the shopper app's key: the two apps can share a phone and must never share a session.
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('citycart.partner.session', 'abc.def.ghi', {
      keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    })
    expect(tokenStore.get()).toBe('abc.def.ghi')
  })

  it('loads the saved token once at start', async () => {
    SecureStore.getItemAsync.mockResolvedValue('saved.token')
    expect(await tokenStore.load()).toBe('saved.token')
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('citycart.partner.session')
    expect(tokenStore.get()).toBe('saved.token')
  })

  it('treats an unreadable keychain as signed out', async () => {
    SecureStore.getItemAsync.mockRejectedValue(new Error('locked'))
    expect(await tokenStore.load()).toBeNull()
  })

  it('clear forgets it everywhere, even if nothing was stored', async () => {
    await tokenStore.set('x')
    SecureStore.deleteItemAsync.mockRejectedValue(new Error('nothing'))
    await tokenStore.clear()
    expect(tokenStore.get()).toBeNull()
  })
})
