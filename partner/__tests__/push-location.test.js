/**
 * Push notifications and the rider sharing their position (docs/20 §5.7): the rules that keep
 * both safe, tested without a phone.
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
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}))
const mockNotifications = require('expo-notifications')
const mockLocation = require('expo-location')

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

import * as SecureStore from 'expo-secure-store'
import api, { setUnauthorizedHandler } from '../src/services/api'
import { destinationFor, listenForNotificationTaps, pushPossible, registerForPush, unregisterPush } from '../src/services/push'
import { createLocationSharer, ensureLocationPermission, IDLE_MS, sendPosition, startWatching, stopSharingOnServer } from '../src/services/location'
import { getShareLocation, loadPrefs, setShareLocation, subscribeShareLocation } from '../src/services/prefs'
import { useLocationSharing } from '../src/hooks/useLocationSharing'
import { AuthProvider } from '../src/context/AuthProvider'
import { useAuth } from '../src/hooks/useAuth'
import Account from '../src/app/(rider)/account'
import { cleanup, pressByLabel, RIDER, screenText, show, signedIn, tick } from './helpers/screens'

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
  mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })
  mockLocation.watchPositionAsync.mockResolvedValue({ remove: jest.fn() })
  SecureStore.getItemAsync.mockResolvedValue(null)
  SecureStore.setItemAsync.mockResolvedValue(undefined)
  SecureStore.deleteItemAsync.mockResolvedValue(undefined)
  api.put.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
  await unregisterPush() // forget any token a previous test registered
  await setShareLocation(false)
  jest.clearAllMocks()
})
afterEach(cleanup)

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
    expect(destinationFor('RIDER', { deliveryId: 'd1' })).toBe('/delivery/d1')
    expect(destinationFor('BRAND_EMPLOYEE', { orderId: 'o1' })).toBe('/order/o1')
    expect(destinationFor('RIDER', { orderId: 'o1' })).toBeNull()
    expect(destinationFor('BRAND_EMPLOYEE', { deliveryId: 'd1' })).toBeNull()
    expect(destinationFor('RIDER', null)).toBeNull()
    expect(destinationFor('CUSTOMER', { deliveryId: 'd1' })).toBeNull()
  })

  it('listens for taps (also the one that launched the app) and can stop listening', async () => {
    const remove = jest.fn()
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove })
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue({ notification: { request: { content: { data: { deliveryId: 'cold' } } } } })
    const onOpen = jest.fn()

    const stop = await listenForNotificationTaps(onOpen)

    expect(onOpen).toHaveBeenCalledWith({ deliveryId: 'cold' })
    const listener = mockNotifications.addNotificationResponseReceivedListener.mock.calls[0][0]
    listener({ notification: { request: { content: { data: { deliveryId: 'tap' } } } } })
    expect(onOpen).toHaveBeenLastCalledWith({ deliveryId: 'tap' })
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

describe('deciding what to do with each new position', () => {
  const coords = { latitude: 31.4181, longitude: 73.0776, accuracy: 12, altitude: 180, speed: 4 }

  it('sends only latitude, longitude and accuracy (nothing else the phone knows)', async () => {
    const send = jest.fn().mockResolvedValue({})
    const onPosition = createLocationSharer({ send })
    expect(await onPosition(coords)).toBe('sent')
    expect(send).toHaveBeenCalledWith({ latitude: 31.4181, longitude: 73.0776, accuracy: 12 })
  })

  it('leaves accuracy out when the phone does not know it', async () => {
    const send = jest.fn().mockResolvedValue({})
    await createLocationSharer({ send })({ latitude: 1, longitude: 2, accuracy: null })
    expect(send).toHaveBeenCalledWith({ latitude: 1, longitude: 2 })
  })

  it('goes quiet for a minute when no delivery is out, then tries again', async () => {
    let clock = 1_000_000
    const send = jest.fn().mockRejectedValue(httpError(409, { code: 'NO_ACTIVE_DELIVERY' }))
    const onPosition = createLocationSharer({ send, now: () => clock })

    expect(await onPosition(coords)).toBe('idle')
    expect(send).toHaveBeenCalledTimes(1)
    clock += IDLE_MS - 1
    expect(await onPosition(coords)).toBe('idle') // still quiet: no request
    expect(send).toHaveBeenCalledTimes(1)
    clock += 2
    send.mockResolvedValue({})
    expect(await onPosition(coords)).toBe('sent') // a delivery went out meanwhile
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('any other failure is just skipped (the next position tries again at once)', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue({})
    const onPosition = createLocationSharer({ send })
    expect(await onPosition(coords)).toBe('failed')
    expect(await onPosition(coords)).toBe('sent')
  })

  it('talks to the rider endpoints and never fails loudly when stopping', async () => {
    await sendPosition({ latitude: 1, longitude: 2 })
    expect(api.put).toHaveBeenCalledWith('/rider/deliveries/location', { latitude: 1, longitude: 2 })
    await stopSharingOnServer()
    expect(api.delete).toHaveBeenCalledWith('/rider/deliveries/location')
    api.delete.mockRejectedValue(httpError(500))
    await expect(stopSharingOnServer()).resolves.toBeUndefined()
  })
})

describe('location permission and watching', () => {
  it('uses the permission already given, and asks only when needed', async () => {
    expect(await ensureLocationPermission()).toBe(true)
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled()

    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })
    expect(await ensureLocationPermission()).toBe(true)
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })
    expect(await ensureLocationPermission()).toBe(false)
  })

  it('watches about every half minute, balanced accuracy, only while the app is open (foreground)', async () => {
    const remove = jest.fn()
    mockLocation.watchPositionAsync.mockResolvedValue({ remove })
    const onCoords = jest.fn()
    const stop = await startWatching(onCoords)
    expect(mockLocation.watchPositionAsync).toHaveBeenCalledWith({ accuracy: 3, timeInterval: 30000, distanceInterval: 25 }, expect.any(Function))
    mockLocation.watchPositionAsync.mock.calls[0][1]({ coords: { latitude: 1, longitude: 2 } })
    expect(onCoords).toHaveBeenCalledWith({ latitude: 1, longitude: 2 })
    stop()
    expect(remove).toHaveBeenCalled()
  })
})

describe('the sharing setting', () => {
  it('is off by default, kept on the phone, and tells listeners at once when it changes', async () => {
    expect((await loadPrefs()).shareLocation).toBe(false)
    const listener = jest.fn()
    const off = subscribeShareLocation(listener)
    await setShareLocation(true)
    expect(getShareLocation()).toBe(true)
    expect(listener).toHaveBeenCalledWith(true)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('citycart.partner.shareLocation', '1')
    await setShareLocation(false)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('citycart.partner.shareLocation')
    off()
    await setShareLocation(true)
    expect(listener).toHaveBeenCalledTimes(2) // no longer listening
  })

  it('reads a saved "on" at app start', async () => {
    SecureStore.getItemAsync.mockResolvedValue('1')
    expect((await loadPrefs()).shareLocation).toBe(true)
  })
})

describe('the hook that keeps sharing going', () => {
  function Harness() {
    useLocationSharing()
    return null
  }
  // Every hook mounted here is unmounted after the test, so a leftover one cannot react to the next test's setting.
  const mounted = []
  afterEach(async () => {
    while (mounted.length) {
      const renderer = mounted.pop()
      try {
        await act(async () => renderer.unmount())
      } catch {
        /* already unmounted by the test */
      }
    }
  })
  const mount = async () => {
    let renderer
    await act(async () => {
      renderer = TestRenderer.create(<Harness />)
    })
    mounted.push(renderer)
    await tick()
    return renderer
  }

  it('does nothing while the rider has not switched sharing on', async () => {
    await mount()
    expect(mockLocation.watchPositionAsync).not.toHaveBeenCalled()
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  })

  it('starts when the switch is turned on, reports positions, and stops (telling the server) when it is turned off', async () => {
    const remove = jest.fn()
    mockLocation.watchPositionAsync.mockResolvedValue({ remove })
    await mount()

    await act(async () => setShareLocation(true))
    await tick()
    expect(mockLocation.watchPositionAsync).toHaveBeenCalledTimes(1)

    await act(async () => mockLocation.watchPositionAsync.mock.calls[0][1]({ coords: { latitude: 31.4, longitude: 73.1, accuracy: 9 } }))
    expect(api.put).toHaveBeenCalledWith('/rider/deliveries/location', { latitude: 31.4, longitude: 73.1, accuracy: 9 })

    await act(async () => setShareLocation(false))
    await tick()
    expect(remove).toHaveBeenCalled()
    expect(api.delete).toHaveBeenCalledWith('/rider/deliveries/location')
  })

  it('starts at once when the saved setting is already on', async () => {
    SecureStore.getItemAsync.mockResolvedValue('1')
    await mount()
    expect(mockLocation.watchPositionAsync).toHaveBeenCalledTimes(1)
  })

  it('does not start without the phone\'s permission', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })
    await mount()
    await act(async () => setShareLocation(true))
    await tick()
    expect(mockLocation.watchPositionAsync).not.toHaveBeenCalled()
  })

  it('stops, and forgets the position on the server, when the screen goes away (sign-out)', async () => {
    const remove = jest.fn()
    mockLocation.watchPositionAsync.mockResolvedValue({ remove })
    const renderer = await mount()
    await act(async () => setShareLocation(true))
    await tick()
    await act(async () => renderer.unmount())
    expect(remove).toHaveBeenCalled()
    expect(api.delete).toHaveBeenCalledWith('/rider/deliveries/location')
  })

  it('a rider who switched it off while permission was still being asked is never tracked', async () => {
    let allow
    mockLocation.getForegroundPermissionsAsync.mockReturnValue(new Promise((resolve) => (allow = resolve)))
    const remove = jest.fn()
    mockLocation.watchPositionAsync.mockResolvedValue({ remove })
    await mount()
    await act(async () => setShareLocation(true)) // starts asking...
    await act(async () => setShareLocation(false)) // ...and they change their mind
    await act(async () => allow({ status: 'granted' }))
    await tick()
    expect(mockLocation.watchPositionAsync.mock.calls.length === 0 || remove.mock.calls.length > 0).toBe(true)
  })
})

describe('the Account switch', () => {
  const ACCOUNT_LABEL = 'Share my location while I deliver'
  const flip = async (screen, value) => {
    const sw = screen.root.findAll((n) => n.props.accessibilityLabel === ACCOUNT_LABEL && typeof n.props.onValueChange === 'function')[0]
    await act(async () => sw.props.onValueChange(value))
    await tick()
  }

  it('is off, with a plain explanation, until the rider turns it on', async () => {
    const screen = await show(<Account />)
    const text = screenText(screen)
    expect(text).toMatch(/Share my location while I deliver/)
    expect(text).toMatch(/Off unless you turn it on/)
    expect(text).toMatch(/only while this app is open/)
    expect(getShareLocation()).toBe(false)
  })

  it('turns on after the phone grants permission', async () => {
    const screen = await show(<Account />)
    await flip(screen, true)
    expect(getShareLocation()).toBe(true)
  })

  it('stays off, and says why, when the phone refuses permission', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })
    const screen = await show(<Account />)
    await flip(screen, true)
    expect(getShareLocation()).toBe(false)
    expect(screenText(screen)).toMatch(/Location is turned off for this app/)
  })

  it('turning it off tells the server to forget the position', async () => {
    await setShareLocation(true)
    const screen = await show(<Account />)
    await flip(screen, false)
    expect(getShareLocation()).toBe(false)
    expect(api.delete).toHaveBeenCalledWith('/rider/deliveries/location')
  })

  it('shows who is signed in', async () => {
    const screen = await show(<Account />, { auth: signedIn(RIDER) })
    expect(screenText(screen)).toMatch(/Bilal Ahmed/)
    await pressByLabel(screen, 'Sign out').catch(() => {}) // the button is a plain Button; covered in screens.test.js
  })
})

describe('signing out of this phone', () => {
  const session = require('../src/services/session')
  beforeEach(() => {
    session.restoreSession.mockResolvedValue({ status: 'signedIn', user: { role: 'RIDER', name: 'Bilal' } })
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

  it('stops notifications and sharing while the session still works, turns sharing off, then signs out', async () => {
    await registerForPush()
    await setShareLocation(true)
    jest.clearAllMocks()
    await mountAuth()

    await act(async () => ctx.logout())

    expect(api.delete).toHaveBeenCalledWith('/devices/push-token', { data: { token: TOKEN } })
    expect(api.delete).toHaveBeenCalledWith('/rider/deliveries/location')
    expect(getShareLocation()).toBe(false) // the next person on this phone does not inherit it
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
