jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
}))
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }))

import * as SecureStore from 'expo-secure-store'
import api from '../src/services/api'
import { isPartnerRole, PARTNER_ROLES, restoreSession, signIn, signOut } from '../src/services/session'
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
  it('riders and brand team members only, like the server', () => {
    expect(PARTNER_ROLES).toEqual(['RIDER', 'BRAND_EMPLOYEE'])
    expect(isPartnerRole('RIDER')).toBe(true)
    expect(isPartnerRole('BRAND_EMPLOYEE')).toBe(true)
    ;['BRAND_ADMIN', 'SUPER_ADMIN', 'CUSTOMER', undefined].forEach((role) => expect(isPartnerRole(role)).toBe(false))
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

  it('forgets the token of an account this app is not for', async () => {
    SecureStore.getItemAsync.mockResolvedValue('odd.token')
    api.get.mockResolvedValue({ data: { user: { role: 'CUSTOMER' } } })
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
  it('uses the PARTNER login, stores the token and returns the user', async () => {
    api.post.mockResolvedValue({ data: { user: RIDER, token: 'fresh.token' } })
    const user = await signIn({ email: 'bilal@example.com', password: 'pw123456' })
    expect(api.post).toHaveBeenCalledWith('/auth/partner/login', { email: 'bilal@example.com', password: 'pw123456' })
    expect(user).toEqual(RIDER)
    expect(tokenStore.get()).toBe('fresh.token')
  })

  it("loads a team member's permissions from /auth/me, because the sign-in answer does not carry them", async () => {
    const withPermissions = { name: 'Maryam', role: 'BRAND_EMPLOYEE', permissions: ['orders.view'] }
    api.post.mockResolvedValue({ data: { user: { name: 'Maryam', role: 'BRAND_EMPLOYEE' }, token: 'emp.token' } })
    api.get.mockResolvedValue({ data: { user: withPermissions } })
    expect(await signIn({ email: 'm@example.com', password: 'x' })).toEqual(withPermissions)
    expect(api.get).toHaveBeenCalledWith('/auth/me')
    expect(tokenStore.get()).toBe('emp.token')
  })

  it('does not keep a session it could not finish setting up (permissions unavailable)', async () => {
    api.post.mockResolvedValue({ data: { user: { role: 'BRAND_EMPLOYEE' }, token: 'emp.token' } })
    api.get.mockRejectedValue(httpError(503))
    await expect(signIn({ email: 'm@example.com', password: 'x' })).rejects.toBeDefined()
    expect(tokenStore.get()).toBeNull()
  })

  it('a rider needs no extra request', async () => {
    api.post.mockResolvedValue({ data: { user: RIDER, token: 'r.token' } })
    await signIn({ email: 'b@example.com', password: 'x' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('refuses a reply without a token, and a reply for the wrong kind of account, and stores nothing', async () => {
    api.post.mockResolvedValue({ data: { user: RIDER } })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/did not return a session/)
    api.post.mockResolvedValue({ data: { user: { role: 'BRAND_ADMIN' }, token: 't' } })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/did not return a session/)
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
