jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
}))
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }))

import * as SecureStore from 'expo-secure-store'
import api from '../src/services/api'
import { DELIVERY_ROLES, isDeliveryRole, restoreSession, signIn, signOut } from '../src/services/session'
import { tokenStore } from '../src/services/storage'

const httpError = (status) => Object.assign(new Error('http'), { response: { status, data: {} } })
const RIDER = { name: 'Bilal', role: 'RIDER' }

beforeEach(async () => {
  jest.clearAllMocks()
  SecureStore.getItemAsync.mockResolvedValue(null)
  SecureStore.setItemAsync.mockResolvedValue(undefined)
  SecureStore.deleteItemAsync.mockResolvedValue(undefined)
  await tokenStore.clear()
  jest.clearAllMocks()
})

describe('who this app is for', () => {
  it('riders only, like the server', () => {
    expect(DELIVERY_ROLES).toEqual(['RIDER'])
    expect(isDeliveryRole('RIDER')).toBe(true)
    ;['BRAND_EMPLOYEE', 'PICKER', 'BRAND_ADMIN', 'SUPER_ADMIN', 'CUSTOMER', undefined].forEach((role) =>
      expect(isDeliveryRole(role)).toBe(false),
    )
  })
})

describe('restoreSession (app start)', () => {
  it('is signed out, without asking the server, when nothing is saved', async () => {
    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('signs in with the saved token when the server accepts it', async () => {
    SecureStore.getItemAsync.mockResolvedValue('saved.token')
    api.get.mockResolvedValue({ data: { user: RIDER } })
    expect(await restoreSession()).toEqual({ status: 'signedIn', user: RIDER })
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })

  it.each([401, 403])('forgets a token the server refuses (%i)', async (status) => {
    SecureStore.getItemAsync.mockResolvedValue('stale.token')
    api.get.mockRejectedValue(httpError(status))
    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(tokenStore.get()).toBeNull()
  })

  it.each(['BRAND_EMPLOYEE', 'PICKER', 'CUSTOMER'])('forgets the token of a %s account, which is not this app', async (role) => {
    SecureStore.getItemAsync.mockResolvedValue('odd.token')
    api.get.mockResolvedValue({ data: { user: { role } } })
    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(tokenStore.get()).toBeNull()
  })

  it('keeps the token when the server cannot be reached, so the next launch can restore it', async () => {
    SecureStore.getItemAsync.mockResolvedValue('good.token')
    api.get.mockRejectedValue(new Error('Network Error'))
    expect(await restoreSession()).toEqual({ status: 'signedOut', offline: true })
    expect(tokenStore.get()).toBe('good.token')

    api.get.mockRejectedValue(httpError(503))
    expect(await restoreSession()).toEqual({ status: 'signedOut', offline: true })
    expect(tokenStore.get()).toBe('good.token')
  })
})

describe('signIn', () => {
  it('uses the DELIVERY login, stores the token and returns the rider', async () => {
    api.post.mockResolvedValue({ data: { user: RIDER, token: 'fresh.token' } })
    const user = await signIn({ email: 'bilal@example.com', password: 'pw123456' })
    expect(api.post).toHaveBeenCalledWith('/auth/delivery/login', { email: 'bilal@example.com', password: 'pw123456' })
    expect(user).toEqual(RIDER)
    expect(tokenStore.get()).toBe('fresh.token')
  })

  it('needs no extra request', async () => {
    api.post.mockResolvedValue({ data: { user: RIDER, token: 'r.token' } })
    await signIn({ email: 'b@example.com', password: 'x' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('refuses a reply without a token, and a reply for the wrong kind of account, and stores nothing', async () => {
    api.post.mockResolvedValue({ data: { user: RIDER } })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/did not return a session/)
    for (const role of ['BRAND_EMPLOYEE', 'PICKER', 'BRAND_ADMIN']) {
      api.post.mockResolvedValue({ data: { user: { role }, token: 't' } })
      await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/did not return a session/)
    }
    expect(tokenStore.get()).toBeNull()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('passes a failed sign-in (wrong password) to the screen', async () => {
    api.post.mockRejectedValue(httpError(401))
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ response: { status: 401 } })
  })
})

describe('signOut', () => {
  it('forgets the token', async () => {
    await tokenStore.set('x')
    await signOut()
    expect(tokenStore.get()).toBeNull()
  })
})
