/**
 * Push notifications (docs/20 §5.7): the rules that keep them safe, tested
 * without a phone.
 */
import React from 'react'
import { Platform } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockConstants = { executionEnvironment: 'bare', expoConfig: { extra: { eas: { projectId: 'project-123' } } }, easConfig: null }
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, key) => mockConstants[key] }),
  ExecutionEnvironment: { StoreClient: 'storeClient', Bare: 'bare', Standalone: 'standalone' },
}))

// The factories build their own mocks; the tests then reach them through require(), because a
// `const` defined here would not exist yet when the mocked module is first loaded.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}))
const mockNotifications = require('expo-notifications')

// Signing out is tested through the real AuthProvider with a pretend session service.
jest.mock('../src/services/session', () => ({
  restoreSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn().mockResolvedValue(undefined), deleteItemAsync: jest.fn().mockResolvedValue(undefined), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (e) => e?.message || 'Something went wrong.',
  getFieldErrors: () => ({}),
  setUnauthorizedHandler: jest.fn(),
}))

import api, { setUnauthorizedHandler } from '../src/services/api'
import { destinationFor, listenForNotificationTaps, pushPossible, registerForPush, unregisterPush } from '../src/services/push'
import { AuthProvider } from '../src/context/AuthProvider'
import { useAuth } from '../src/hooks/useAuth'
import { tick } from './helpers/screens'

const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } })
const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]'

beforeEach(async () => {
  jest.clearAllMocks()
  Object.assign(mockConstants, { executionEnvironment: 'bare', expoConfig: { extra: { eas: { projectId: 'project-123' } } }, easConfig: null })
  mockNotifications.setNotificationChannelAsync.mockResolvedValue(null)
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' })
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN })
  mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() })
  mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(null)
  api.put.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
  await unregisterPush() // forget any token a previous test registered
  jest.clearAllMocks()
})

describe('push notifications', () => {
  it('registers this phone with the server under the signed-in account', async () => {
    const result = await registerForPush()
    expect(result).toEqual({ status: 'registered', token: TOKEN })
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-123' })
    expect(api.put).toHaveBeenCalledWith('/devices/push-token', { token: TOKEN, platform: 'ios' })
    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledTimes(1)
  })

  it('makes the Android channel the server names ("default") before asking for a token', async () => {
    const original = Platform.OS
    Platform.OS = 'android'
    try {
      await registerForPush()
      expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ importance: 4 }))
      expect(api.put).toHaveBeenCalledWith('/devices/push-token', expect.objectContaining({ platform: 'android' }))
    } finally {
      Platform.OS = original
    }
  })

  it('asks for permission when it has not been given, and stops quietly if it is refused', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' })
    expect(await registerForPush()).toEqual({ status: 'denied' })
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled()
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('does nothing in Expo Go, where push cannot work: the module is not even touched', async () => {
    mockConstants.executionEnvironment = 'storeClient'
    expect(pushPossible()).toBe(false)
    expect(await registerForPush()).toEqual({ status: 'unsupported' })
    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })

  it('does nothing, without an error, until the app has an Expo project id', async () => {
    mockConstants.expoConfig = { extra: {} }
    expect(await registerForPush()).toEqual({ status: 'not_configured' })
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('never throws: a failure becomes a status', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error('no google services'))
    expect(await registerForPush()).toEqual({ status: 'error' })
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: TOKEN })
    api.put.mockRejectedValue(httpError(500))
    expect(await registerForPush()).toEqual({ status: 'error' })
  })

  it('signing out removes this phone\'s token from the server, once, and swallows a failure', async () => {
    await registerForPush()
    await unregisterPush()
    expect(api.delete).toHaveBeenCalledWith('/devices/push-token', { data: { token: TOKEN } })
    await unregisterPush()
    expect(api.delete).toHaveBeenCalledTimes(1) // nothing left to remove

    await registerForPush()
    api.delete.mockRejectedValue(httpError(500))
    await expect(unregisterPush()).resolves.toBeUndefined()
  })

  it('a tap opens the right screen for the role, and nothing for data it does not understand', () => {
    expect(destinationFor('BRAND_EMPLOYEE', { orderId: 'o1' })).toBe('/order/o1')
    expect(destinationFor('BRAND_EMPLOYEE', { deliveryId: 'd1' })).toBeNull()
    expect(destinationFor('PICKER', { orderId: 'o1' })).toBeNull()
    expect(destinationFor('RIDER', { deliveryId: 'd1' })).toBeNull()
    expect(destinationFor('BRAND_EMPLOYEE', null)).toBeNull()
  })

  it('listens for taps (also the one that launched the app) and can stop listening', async () => {
    const remove = jest.fn()
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove })
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue({ notification: { request: { content: { data: { orderId: 'cold' } } } } })
    const onOpen = jest.fn()

    const stop = await listenForNotificationTaps(onOpen)

    expect(onOpen).toHaveBeenCalledWith({ orderId: 'cold' })
    const listener = mockNotifications.addNotificationResponseReceivedListener.mock.calls[0][0]
    listener({ notification: { request: { content: { data: { orderId: 'tap' } } } } })
    expect(onOpen).toHaveBeenLastCalledWith({ orderId: 'tap' })
    stop()
    expect(remove).toHaveBeenCalled()
  })

  it('does not listen where push cannot work', async () => {
    mockConstants.executionEnvironment = 'storeClient'
    const stop = await listenForNotificationTaps(jest.fn())
    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })
})

describe('signing out of this phone', () => {
  const session = require('../src/services/session')
  beforeEach(() => {
    session.restoreSession.mockResolvedValue({ status: 'signedIn', user: { role: 'BRAND_EMPLOYEE', name: 'Maryam' } })
    session.signOut.mockResolvedValue(undefined)
  })

  let ctx
  function Capture() {
    ctx = useAuth()
    return null
  }
  const mountAuth = async () => {
    await act(async () => {
      TestRenderer.create(
        <AuthProvider>
          <Capture />
        </AuthProvider>,
      )
    })
    await tick()
  }

  it('stops notifications while the session still works, then signs out', async () => {
    await registerForPush()
    jest.clearAllMocks()
    await mountAuth()

    await act(async () => ctx.logout())

    expect(api.delete).toHaveBeenCalledWith('/devices/push-token', { data: { token: TOKEN } })
    expect(session.signOut).toHaveBeenCalled()
    expect(ctx.status).toBe('signedOut')
  })

  it('a session the SERVER ended makes no requests (they would only fail and loop)', async () => {
    await registerForPush()
    jest.clearAllMocks()
    await mountAuth()
    const handler = setUnauthorizedHandler.mock.calls.find(([h]) => typeof h === 'function')[0]

    await act(async () => handler())

    expect(api.delete).not.toHaveBeenCalled()
    expect(session.signOut).toHaveBeenCalled()
    expect(ctx.status).toBe('signedOut')
  })
})
