/**
 * A store's own page: who they are, what they sell, how to reach them, and the
 * two ways out — the full Nearby search and a product.
 */
import React from 'react'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
let mockParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback) => React.useEffect(callback, []),
    Redirect: () => null,
    Link: ({ children }) => children,
  }
})
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
  getFieldErrors: () => ({}),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import StoreScreen from '../src/app/store/[id]'
import { cleanup, press, screenText, show, tick } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const STORE = {
  _id: 's1',
  name: 'Loom & Co. Gulberg',
  description: 'Everyday lawn and cotton, cut and stitched in Faisalabad.',
  logo: '',
  banner: '',
  address: { addressLine: '12 Main Boulevard', city: 'Faisalabad', state: 'Punjab' },
  contact: { phone: '+92 300 1234567', email: 'hello@loom.pk' },
  businessHours: {
    mon: '10:00 – 20:00',
    tue: '10:00 – 20:00',
    wed: '10:00 – 20:00',
    thu: '10:00 – 20:00',
    fri: '10:00 – 20:00',
    sat: '11:00 – 19:00',
    sun: 'Closed',
  },
}
const STOREFRONT = {
  brand: { _id: ID(1), name: 'Loom & Co.', description: 'A Faisalabad label.' },
  store: STORE,
  categories: [{ _id: 'c1', name: 'Women', children: [{ _id: 'c2', name: 'Lawn' }] }],
  featuredProducts: [
    { _id: ID(2), name: 'Mehrunisa Printed Lawn', price: 3600, images: [], availability: 'IN_STOCK' },
    { _id: ID(3), name: 'Classic Kurta', price: 2500, images: [], availability: 'IN_STOCK' },
  ],
}

const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } })

const pressCard = async (renderer, prefix) => {
  const target = renderer.root.findAll(
    (n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(prefix),
  )[0]
  if (!target) throw new Error(`no card labelled like "${prefix}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { id: ID(1) }
  api.get.mockReset()
})

describe('Store page', () => {
  it('shows the store, its categories, hours, contact details and newest products', async () => {
    api.get.mockResolvedValue({ data: STOREFRONT })
    const renderer = await show(<StoreScreen />)

    expect(api.get).toHaveBeenCalledWith(`/brands/${ID(1)}/storefront`)

    const text = screenText(renderer)
    for (const expected of [
      'On your block',
      'Loom & Co. Gulberg',
      STORE.description,
      'Women',
      'Lawn',
      '12 Main Boulevard, Faisalabad, Punjab',
      '+92 300 1234567',
      'hello@loom.pk',
      'Mon · Tue · Wed · Thu · Fri · Sat',
      'Typically 10:00 – 20:00',
      'Fresh from this store',
      'Mehrunisa Printed Lawn',
      'Classic Kurta',
      'Cash at the door.',
      'Shop this store',
    ]) {
      expect(text).toContain(expected)
    }
  })

  it('opens a product, and sends both calls to action to the Nearby search for this store', async () => {
    api.get.mockResolvedValue({ data: STOREFRONT })
    const renderer = await show(<StoreScreen />)
    const nearby = { pathname: '/nearby', params: { q: STORE.name, t: expect.any(String) } }

    await pressCard(renderer, 'Mehrunisa Printed Lawn,')
    expect(mockRouter.push).toHaveBeenCalledWith(`/product/${ID(2)}`)

    await press(renderer, 'Shop this store')
    expect(mockRouter.navigate).toHaveBeenCalledWith(nearby)

    await press(renderer, 'See everything')
    expect(mockRouter.navigate).toHaveBeenCalledWith(nearby)
  })

  it('says a missing or closed store is unavailable, without a pointless request for a malformed id', async () => {
    api.get.mockRejectedValue(httpError(404, 'Store not found.'))
    const renderer = await show(<StoreScreen />)
    expect(screenText(renderer)).toContain('This store is not available')
    expect(screenText(renderer)).toContain('It may have closed, or the link is wrong.')
    await press(renderer, 'Browse stores near you')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/nearby')
    await cleanup()

    api.get.mockReset()
    mockParams = { id: 'nope' }
    const malformed = await show(<StoreScreen />)
    expect(screenText(malformed)).toContain('This store is not available')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('offers to try again when the store cannot be loaded', async () => {
    api.get.mockRejectedValueOnce(httpError(500, 'The shop service is busy.')).mockResolvedValueOnce({ data: STOREFRONT })
    const renderer = await show(<StoreScreen />)

    expect(screenText(renderer)).toContain("Couldn't load this store")
    expect(screenText(renderer)).toContain('The shop service is busy.')

    await press(renderer, 'Try again')
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(screenText(renderer)).toContain('Loom & Co. Gulberg')
  })

  it('falls back to the brand when the store has no profile of its own', async () => {
    api.get.mockResolvedValue({ data: { brand: { _id: ID(1), name: 'Solo Store', description: 'Small-batch goods.' }, store: null, categories: [], featuredProducts: [] } })
    const text = screenText(await show(<StoreScreen />))
    expect(text).toContain('Solo Store')
    expect(text).toContain('Small-batch goods.')
    expect(text).toContain('The shelves are being stocked')
    expect(text).toContain('Contact details are not listed yet.')
  })
})
