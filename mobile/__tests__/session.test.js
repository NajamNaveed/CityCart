jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
}))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }))

import * as SecureStore from 'expo-secure-store'
import api from '../src/services/api'
import { restoreSession, signIn, signOut, signUp } from '../src/services/session'
import { tokenStore } from '../src/services/storage'

const httpError = (status) => Object.assign(new Error('http'), { response: { status, data: {} } })

beforeEach(async () => {
  jest.clearAllMocks()
  SecureStore.getItemAsync.mockResolvedValue(null)
  SecureStore.setItemAsync.mockResolvedValue(undefined)
  SecureStore.deleteItemAsync.mockResolvedValue(undefined)
  await tokenStore.clear()
  jest.clearAllMocks()
})

describe('restoreSession (app start)', () => {
  it('is signed out, without asking the server, when nothing is saved', async () => {
    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('signs in with the saved token when the server accepts it', async () => {
    SecureStore.getItemAsync.mockResolvedValue('saved.token')
    api.get.mockResolvedValue({ data: { user: { name: 'Sana', role: 'CUSTOMER' } } })

    const result = await restoreSession()

    expect(result).toEqual({ status: 'signedIn', user: { name: 'Sana', role: 'CUSTOMER' } })
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })

  it.each([401, 403])('forgets a token the server refuses (%i)', async (status) => {
    SecureStore.getItemAsync.mockResolvedValue('stale.token')
    api.get.mockRejectedValue(httpError(status))

    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(tokenStore.get()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled()
  })

  it('keeps the token when the server cannot be reached, so the next launch can restore it', async () => {
    SecureStore.getItemAsync.mockResolvedValue('good.token')
    api.get.mockRejectedValue(new Error('Network Error')) // no response at all

    expect(await restoreSession()).toEqual({ status: 'signedOut', offline: true })
    expect(tokenStore.get()).toBe('good.token')
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()

    api.get.mockRejectedValue(httpError(503)) // a server outage is not a logout either
    expect(await restoreSession()).toEqual({ status: 'signedOut', offline: true })
    expect(tokenStore.get()).toBe('good.token')
  })
})

describe('signIn / signUp', () => {
  it('stores the token the server returns and gives back the user', async () => {
    api.post.mockResolvedValue({ data: { user: { name: 'Sana' }, token: 'new.token' } })

    const user = await signIn({ email: 'sana@example.com', password: 'secret123' })

    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'sana@example.com', password: 'secret123' })
    expect(user).toEqual({ name: 'Sana' })
    expect(tokenStore.get()).toBe('new.token')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('citycart.session', 'new.token', expect.any(Object))
  })

  it('registers through the same flow', async () => {
    api.post.mockResolvedValue({ data: { user: { name: 'Ali' }, token: 'reg.token' } })

    await signUp({ name: 'Ali', email: 'ali@example.com', password: 'secret123' })

    expect(api.post).toHaveBeenCalledWith('/auth/register', { name: 'Ali', email: 'ali@example.com', password: 'secret123' })
    expect(tokenStore.get()).toBe('reg.token')
  })

  it('stores nothing and passes the error on when the login fails', async () => {
    api.post.mockRejectedValue(httpError(401))

    await expect(signIn({ email: 'a@b.co', password: 'wrong-password' })).rejects.toMatchObject({ response: { status: 401 } })
    expect(tokenStore.get()).toBeNull()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('refuses a response without a token rather than looking signed in', async () => {
    api.post.mockResolvedValue({ data: { user: { name: 'Sana' } } })

    await expect(signIn({ email: 'a@b.co', password: 'secret123' })).rejects.toThrow(/did not return a session/)
    expect(tokenStore.get()).toBeNull()
  })
})

describe('signOut', () => {
  it('removes the token from memory and secure storage', async () => {
    await tokenStore.set('abc')
    await signOut()
    expect(tokenStore.get()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('citycart.session')
  })
})
