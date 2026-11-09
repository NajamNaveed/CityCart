/**
 * The booking request form against a fake server: picking the service, a
 * published slot or a free time, the address (saved or manual with a map pin),
 * the optional price offer, and what the form sends and shows afterwards.
 */
import React from 'react'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
const mockMaps = { views: [] }
let mockParams = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
  Link: ({ children }) => children,
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('../src/components/NearbyMap', () => {
  const React = require('react')
  const { View } = require('react-native')
  return function MockNearbyMap(props) {
    mockMaps.views.push(props)
    return <View testID="map" />
  }
})
jest.mock('../src/services/location', () => ({ getShopperPosition: jest.fn() }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
  getFieldErrors: (e) => Object.fromEntries((e?.response?.data?.errors || []).map((x) => [x.field, x.message])),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import BookServiceScreen from '../src/app/service/[slug]/book'
import { availableSlots, customDateOptions, karachiDateTimeToIso, minuteLabel } from '../src/utils/serviceSlots'
import { cleanup, press, screenText, show, signedIn, signedOut, tick, type } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BLOCK = { _id: 'block1', name: 'Gulberg', center: { lat: 31.4, lng: 73.1 } }
const EVERY_DAY = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  weekdayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday],
  startMinute: 540,
  endMinute: 1020,
  slotMinutes: 60,
}))

const PROVIDER = {
  _id: ID(1),
  displayName: 'Ali Plumbing',
  slug: 'ali-plumbing',
  avatar: '',
  startingAtPrice: 150000,
  category: { _id: 'cat1', name: 'Plumbing' },
  city: { _id: 'c1', name: 'Faisalabad' },
  block: BLOCK,
  offerings: [
    { _id: 'o1', title: 'Tap repair', slug: 'tap-repair', description: '', images: [], startingAtPrice: 150000, durationMinutes: 60, attributes: {} },
    { _id: 'o2', title: 'Leak fix', slug: 'leak-fix', description: '', images: [], startingAtPrice: 250000, durationMinutes: 90, attributes: {} },
  ],
  availability: { isPublished: true, windows: EVERY_DAY, blackoutDates: [] },
}

const SAVED = {
  _id: ID(7),
  label: 'Home',
  fullName: 'Sana Iqbal',
  phone: '+92 300 1234567',
  addressLine: 'House 41, Street 5',
  city: 'Faisalabad',
  latitude: 31.401,
  longitude: 73.101,
  blocks: [BLOCK],
}

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { response: { status, data: { message, ...extra } } })
const BOOKING = { _id: ID(5), bookingNumber: 'BK-1001', status: 'REQUESTED' }

let addresses
function serve(provider = PROVIDER) {
  addresses = []
  api.get.mockImplementation(async (url) => {
    if (url === '/services/providers/ali-plumbing') {
      if (!provider) throw httpError(404, 'Provider not found.')
      return { data: { provider } }
    }
    if (url === '/addresses') return { data: { addresses } }
    throw new Error(`unexpected GET ${url}`)
  })
}

// Rows with a dynamic accessibility label such as "Date: Tomorrow".
const pressLabelPrefix = async (renderer, prefix) => {
  const target = renderer.root.findAll(
    (n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(prefix),
  )[0]
  if (!target) throw new Error(`nothing to press labelled like "${prefix}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

const fillManual = async (renderer) => {
  await type(renderer, 'Phone', '+92 300 1234567')
  await type(renderer, 'Address', 'House 41, Street 5')
}

const posted = () => api.post.mock.calls.find(([url]) => url === '/services/bookings')?.[1]

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { slug: 'ali-plumbing' }
  mockMaps.views.length = 0
  serve()
  api.post.mockResolvedValue({ data: { booking: BOOKING } })
})

describe('booking request', () => {
  it('shows the provider, the first service and the default published slot', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    const text = screenText(renderer)
    for (const expected of ['Request a booking', 'Ali Plumbing', 'Plumbing · Gulberg', 'Tap repair — Rs 1,500', 'Full service · about 1 h on site', 'Full service, one visit', 'Rs 1,500', 'Pakistan time.']) {
      expect(text).toContain(expected)
    }
    expect(api.get).toHaveBeenCalledWith('/services/providers/ali-plumbing')
    expect(api.get).toHaveBeenCalledWith('/addresses')
  })

  it('sends the request with the default slot, address and pin', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    // The first slot of the first day that still has one.
    const expectedSlot = availableSlots(PROVIDER.availability, 60)[0].value

    expect(screenText(renderer)).toContain('This provider works only in Gulberg.')
    await fillManual(renderer)
    await type(renderer, 'Note for the provider', 'Gate code 4471')
    await press(renderer, 'Request this time')

    expect(posted()).toEqual({
      providerId: PROVIDER._id,
      offeringId: 'o1',
      scheduledStart: expectedSlot,
      address: { fullName: 'Sana Iqbal', phone: '+92 300 1234567', addressLine: 'House 41, Street 5' },
      location: { lat: 31.4, lng: 73.1 },
      note: 'Gate code 4471',
    })
    const text = screenText(renderer)
    expect(text).toContain('Request sent')
    expect(text).toContain('Booking BK-1001')
    expect(text).toContain('Ali Plumbing will accept, or send a price.')

    await press(renderer, 'Back to Ali Plumbing')
    expect(mockRouter.replace).toHaveBeenCalledWith('/service/ali-plumbing')
  })

  it('lets the shopper pick another service and propose a whole-job price', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    await press(renderer, 'Tap repair — Rs 1,500')
    await press(renderer, 'Leak fix — Rs 2,500')

    expect(screenText(renderer)).toContain('Full service · about 1 h 30 min on site')
    await type(renderer, 'Your price for the job (Rs) — optional', '2,000')
    await fillManual(renderer)
    await press(renderer, 'Request this time')

    expect(posted()).toMatchObject({ offeringId: 'o2', customerOfferPaisa: 200000 })
    expect(posted()).not.toHaveProperty('note')
  })

  it('checks the address and the offer before sending anything', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    await type(renderer, 'Phone', '12')
    await type(renderer, 'Your price for the job (Rs) — optional', 'abc')
    await press(renderer, 'Request this time')

    const text = screenText(renderer)
    expect(text).toContain('Check the highlighted fields.')
    expect(text).toContain('Enter a phone number the provider can call.')
    expect(text).toContain('Enter the full address.')
    expect(text).toContain('Enter the amount you want to pay.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the field the server refused and lets the shopper retry', async () => {
    api.post.mockRejectedValue(httpError(400, 'Validation failed.', { errors: [{ field: 'address.phone', message: 'That phone number is not valid.' }] }))
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    await fillManual(renderer)
    await press(renderer, 'Request this time')

    const text = screenText(renderer)
    expect(text).toContain('Validation failed.')
    expect(text).toContain('That phone number is not valid.')
    expect(text).toContain('Request this time') // not stuck sending
  })

  it('uses a saved address that falls inside the provider\'s block', async () => {
    addresses = [SAVED, { ...SAVED, _id: ID(8), label: 'Office', blocks: [{ _id: 'block9', name: 'DHA' }] }]
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    const text = screenText(renderer)
    expect(text).toContain('Home · Sana Iqbal')
    expect(text).toContain('House 41, Street 5, Faisalabad')
    expect(text).toContain('Use a different address')
    // The out-of-block address is not offered.
    expect(text).not.toContain('Office · Sana Iqbal')

    await press(renderer, 'Request this time')
    expect(posted()).toMatchObject({
      address: { fullName: 'Sana Iqbal', phone: '+92 300 1234567', addressLine: 'House 41, Street 5', city: 'Faisalabad' },
      location: { lat: 31.401, lng: 73.101 },
    })
  })

  it('switches from a saved address to a manual one', async () => {
    addresses = [SAVED]
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    expect(screenText(renderer)).not.toContain('Person to meet')

    await press(renderer, 'Use a different address')
    expect(screenText(renderer)).toContain('Person to meet')
    await fillManual(renderer)
    await press(renderer, 'Request this time')
    expect(posted()).toMatchObject({ address: { addressLine: 'House 41, Street 5' } })
    expect(posted().address).not.toHaveProperty('city')
  })

  it('takes the pin from the shopper\'s current location', async () => {
    getShopperPosition.mockResolvedValue({ lat: 31.4102, lng: 73.1102 })
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    await press(renderer, 'Use my current location')
    expect(mockMaps.views.at(-1).pin).toEqual({ lat: 31.4102, lng: 73.1102 })

    await fillManual(renderer)
    await press(renderer, 'Request this time')
    expect(posted().location).toEqual({ lat: 31.4102, lng: 73.1102 })
  })

  it('explains when the phone will not share its location', async () => {
    getShopperPosition.mockRejectedValue(Object.assign(new Error('Location permission was not given.'), { code: 'DENIED' }))
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    await press(renderer, 'Use my current location')
    expect(screenText(renderer)).toContain('Location permission was not given.')
  })

  it('moves the pin when the shopper taps the map', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    await act(async () => mockMaps.views.at(-1).onPick(31.4203, 73.1204))
    await tick()

    await fillManual(renderer)
    await press(renderer, 'Request this time')
    expect(posted().location).toEqual({ lat: 31.4203, lng: 73.1204 })
  })

  it('asks for any future time when the provider has no fixed hours', async () => {
    serve({ ...PROVIDER, availability: { isPublished: false, windows: [], blackoutDates: [] } })
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    expect(screenText(renderer)).toContain('no fixed hours')

    const tomorrow = customDateOptions()[1].value
    await pressLabelPrefix(renderer, 'Date:')
    await press(renderer, 'Tomorrow')
    await pressLabelPrefix(renderer, 'Time:')
    await press(renderer, minuteLabel(10 * 60))

    await fillManual(renderer)
    await press(renderer, 'Request this time')
    expect(posted().scheduledStart).toBe(karachiDateTimeToIso(tomorrow, 600))
  })

  it('says when the next ten days have no open time', async () => {
    serve({ ...PROVIDER, availability: { isPublished: true, windows: EVERY_DAY, blackoutDates: customDateOptions({ days: 10 }).map((item) => item.value) } })
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    expect(screenText(renderer)).toContain('No open times in the next ten days.')
  })

  it('explains when the provider has no service to book yet', async () => {
    serve({ ...PROVIDER, offerings: [] })
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    const text = screenText(renderer)
    expect(text).toContain('No services to book yet')
    expect(text).not.toContain('Request this time')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('asks a visitor to sign in first, then returns to this form', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedOut() })
    expect(screenText(renderer)).toContain('Sign in to request a booking')

    await press(renderer, 'Sign in')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/service/ali-plumbing/book' } })
  })

  it('tells a seller account this form is for shoppers', async () => {
    const renderer = await show(<BookServiceScreen />, { auth: signedIn({ id: 'u2', name: 'Loom & Co.', role: 'BRAND_ADMIN' }) })
    expect(screenText(renderer)).toContain('This is for shoppers')
  })

  it('offers other providers when the page is gone', async () => {
    serve(null)
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    expect(screenText(renderer)).toContain('Provider not found')

    await press(renderer, 'Browse services')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/services')
  })

  it('offers to try again when the provider cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Database is busy.'))
    const renderer = await show(<BookServiceScreen />, { auth: signedIn() })
    expect(screenText(renderer)).toContain("Couldn't load this provider")

    serve()
    await press(renderer, 'Try again')
    expect(screenText(renderer)).toContain('Tap repair — Rs 1,500')
  })
})
