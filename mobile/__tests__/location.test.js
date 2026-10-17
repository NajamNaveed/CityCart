jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}))

import * as Location from 'expo-location'
import { getShopperPosition, LocationError } from '../src/services/location'

const granted = { granted: true, canAskAgain: true, status: 'granted' }
const fix = (latitude, longitude) => ({ coords: { latitude, longitude } })

beforeEach(() => {
  jest.clearAllMocks()
  Location.getForegroundPermissionsAsync.mockResolvedValue(granted)
  Location.hasServicesEnabledAsync.mockResolvedValue(true)
  Location.getLastKnownPositionAsync.mockResolvedValue(null)
  Location.getCurrentPositionAsync.mockResolvedValue(fix(31.418654, 73.079043))
})

describe('getShopperPosition', () => {
  it('does not ask again when permission is already given, and rounds the position', async () => {
    expect(await getShopperPosition()).toEqual({ lat: 31.4187, lng: 73.079 })
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  })

  it('asks for permission when it has not been given yet', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
    Location.requestForegroundPermissionsAsync.mockResolvedValue(granted)
    await getShopperPosition()
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1)
  })

  it('uses a recent known position instead of waiting for a new one', async () => {
    Location.getLastKnownPositionAsync.mockResolvedValue(fix(31.4, 73.1))
    expect(await getShopperPosition()).toEqual({ lat: 31.4, lng: 73.1 })
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('reports a refusal, and whether the phone will ask again', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false })
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false })
    await expect(getShopperPosition()).rejects.toMatchObject({ code: 'DENIED', canAskAgain: false })

    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true })
    await expect(getShopperPosition()).rejects.toMatchObject({ code: 'DENIED', canAskAgain: true })
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('reports location switched off', async () => {
    Location.hasServicesEnabledAsync.mockResolvedValue(false)
    await expect(getShopperPosition()).rejects.toMatchObject({ code: 'SERVICES_OFF' })
  })

  it('gives up after the time limit instead of hanging', async () => {
    jest.useFakeTimers()
    Location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {})) // never answers
    const pending = getShopperPosition({ timeoutMs: 5000 })
    const outcome = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await jest.advanceTimersByTimeAsync(5001)
    await outcome
    jest.useRealTimers()
  })

  it('turns any other failure into UNAVAILABLE', async () => {
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('native crash'))
    const error = await getShopperPosition().catch((e) => e)
    expect(error).toBeInstanceOf(LocationError)
    expect(error.code).toBe('UNAVAILABLE')
  })

  it('treats a failing last-known lookup as "none" and carries on', async () => {
    Location.getLastKnownPositionAsync.mockRejectedValue(new Error('nope'))
    expect(await getShopperPosition()).toEqual({ lat: 31.4187, lng: 73.079 })
  })
})
