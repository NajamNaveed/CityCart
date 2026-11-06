jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
}))
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }))

import * as SecureStore from 'expo-secure-store'
import api from '../src/services/api'
import { chooseWorkspace, isStaffRole, restoreSession, signIn, signOut, STAFF_ROLES } from '../src/services/session'
import { tokenStore } from '../src/services/storage'

const httpError = (status) => Object.assign(new Error('http'), { response: { status, data: {} } })
const EMPLOYEE = { name: 'Maryam', role: 'BRAND_EMPLOYEE', permissions: ['orders.view'] }
const PICKER = { name: 'Ali', role: 'PICKER' }
const workspaceReply = {
  response: {
    status: 409,
    data: {
      code: 'WORKSPACE_REQUIRED',
      message: 'Choose a workspace.',
      workspaceToken: 'workspace.token',
      memberships: [
        { brandId: 'a'.repeat(24), brandName: 'Acme', role: 'BRAND_EMPLOYEE' },
        { brandId: 'b'.repeat(24), brandName: 'Bravo', role: 'BRAND_EMPLOYEE' },
      ],
    },
  },
}

beforeEach(async () => {
  jest.clearAllMocks()
  SecureStore.getItemAsync.mockResolvedValue(null)
  SecureStore.setItemAsync.mockResolvedValue(undefined)
  SecureStore.deleteItemAsync.mockResolvedValue(undefined)
  await tokenStore.clear()
  jest.clearAllMocks()
})

describe('who this app is for', () => {
  it('brand team members and pickers only, like the server', () => {
    expect(STAFF_ROLES).toEqual(['BRAND_EMPLOYEE', 'PICKER'])
    expect(isStaffRole('BRAND_EMPLOYEE')).toBe(true)
    expect(isStaffRole('PICKER')).toBe(true)
    ;['RIDER', 'BRAND_ADMIN', 'SUPER_ADMIN', 'CUSTOMER', undefined].forEach((role) => expect(isStaffRole(role)).toBe(false))
  })
})

describe('restoreSession (app start)', () => {
  it('is signed out, without asking the server, when nothing is saved', async () => {
    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('signs in with the saved token when the server accepts it', async () => {
    SecureStore.getItemAsync.mockResolvedValue('saved.token')
    api.get.mockResolvedValue({ data: { user: EMPLOYEE } })
    expect(await restoreSession()).toEqual({ status: 'signedIn', user: EMPLOYEE })
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })

  it('also restores a picker', async () => {
    SecureStore.getItemAsync.mockResolvedValue('saved.token')
    api.get.mockResolvedValue({ data: { user: PICKER } })
    expect(await restoreSession()).toEqual({ status: 'signedIn', user: PICKER })
  })

  it.each([401, 403])('forgets a token the server refuses (%i)', async (status) => {
    SecureStore.getItemAsync.mockResolvedValue('stale.token')
    api.get.mockRejectedValue(httpError(status))
    expect(await restoreSession()).toEqual({ status: 'signedOut' })
    expect(tokenStore.get()).toBeNull()
  })

  it('forgets the token of an account this app is not for', async () => {
    SecureStore.getItemAsync.mockResolvedValue('odd.token')
    api.get.mockResolvedValue({ data: { user: { role: 'RIDER' } } })
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
  it('uses the STAFF login, stores the token and returns the user', async () => {
    api.post.mockResolvedValue({ data: { user: PICKER, token: 'fresh.token' } })
    const user = await signIn({ email: 'ali@example.com', password: 'pw123456' })
    expect(api.post).toHaveBeenCalledWith('/auth/staff/login', { email: 'ali@example.com', password: 'pw123456' })
    expect(user).toEqual(PICKER)
    expect(tokenStore.get()).toBe('fresh.token')
  })

  it("loads a team member's permissions from /auth/me, because the sign-in answer does not carry them", async () => {
    api.post.mockResolvedValue({ data: { user: { name: 'Maryam', role: 'BRAND_EMPLOYEE' }, token: 'emp.token' } })
    api.get.mockResolvedValue({ data: { user: EMPLOYEE } })
    expect(await signIn({ email: 'm@example.com', password: 'x' })).toEqual(EMPLOYEE)
    expect(api.get).toHaveBeenCalledWith('/auth/me')
    expect(tokenStore.get()).toBe('emp.token')
  })

  it('does not keep a session it could not finish setting up (permissions unavailable)', async () => {
    api.post.mockResolvedValue({ data: { user: { role: 'BRAND_EMPLOYEE' }, token: 'emp.token' } })
    api.get.mockRejectedValue(httpError(503))
    await expect(signIn({ email: 'm@example.com', password: 'x' })).rejects.toBeDefined()
    expect(tokenStore.get()).toBeNull()
  })

  it('a picker needs no extra request', async () => {
    api.post.mockResolvedValue({ data: { user: PICKER, token: 'p.token' } })
    await signIn({ email: 'a@example.com', password: 'x' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('refuses a reply without a token, and a reply for the wrong kind of account, and stores nothing', async () => {
    api.post.mockResolvedValue({ data: { user: EMPLOYEE } })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/did not return a session/)
    api.post.mockResolvedValue({ data: { user: { role: 'RIDER' }, token: 't' } })
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toThrow(/did not return a session/)
    expect(tokenStore.get()).toBeNull()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('passes a failed sign-in (wrong password) to the screen', async () => {
    api.post.mockRejectedValue(httpError(401))
    await expect(signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ response: { status: 401 } })
  })
})

describe('workspace sign-in', () => {
  it('holds the sign-in with the workspace choices and stores no token yet', async () => {
    api.post.mockRejectedValue(workspaceReply)
    await expect(signIn({ email: 'm@example.com', password: 'x' })).rejects.toMatchObject({
      workspace: {
        workspaceToken: 'workspace.token',
        memberships: expect.arrayContaining([expect.objectContaining({ brandName: 'Acme' })]),
      },
    })
    expect(tokenStore.get()).toBeNull()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('exchanges the choice for a staff session and loads the permissions', async () => {
    api.post.mockResolvedValue({ data: { user: { role: 'BRAND_EMPLOYEE' }, token: 'staff.token' } })
    api.get.mockResolvedValue({ data: { user: EMPLOYEE } })

    const user = await chooseWorkspace({ workspaceToken: 'workspace.token', brandId: 'b'.repeat(24) })

    expect(api.post).toHaveBeenCalledWith('/auth/workspace', { workspaceToken: 'workspace.token', brandId: 'b'.repeat(24) })
    expect(user).toEqual(EMPLOYEE)
    expect(tokenStore.get()).toBe('staff.token')
  })

  it('stores nothing when the chosen workspace was revoked meanwhile', async () => {
    api.post.mockRejectedValue(
      Object.assign(new Error('gone'), { response: { status: 403, data: { code: 'WORKSPACE_UNAVAILABLE' } } }),
    )
    await expect(chooseWorkspace({ workspaceToken: 'workspace.token', brandId: 'b'.repeat(24) })).rejects.toBeDefined()
    expect(tokenStore.get()).toBeNull()
  })
})

describe('signOut', () => {
  it('forgets the token', async () => {
    await tokenStore.set('x')
    await signOut()
    expect(tokenStore.get()).toBeNull()
  })
})
