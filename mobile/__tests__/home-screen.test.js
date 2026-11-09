/**
 * The home feed: stores in the shopper's blocks first, a shelf picked from those
 * stores, and the way into a store page, a product, the stores list and Nearby.
 */
import React from 'react'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
const mockParams = {}

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
import Home from '../src/app/(tabs)/index'
import { cleanup, nearbyValue, press, screenText, show, tick } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BLOCK = { _id: 'block1', name: 'Gulberg' }
const OTHER_BLOCK = { _id: 'block2', name: "People's Colony" }

const STORE_IN = {
  _id: ID(1),
  name: 'Loom & Co.',
  logo: '',
  nearestKm: 0.2,
  branchCount: 1,
  branches: [{ _id: 'br1', blockId: BLOCK._id, blockName: BLOCK.name }],
  products: [{ _id: ID(2), name: 'Mehrunisa Printed Lawn', price: 3600, image: '' }],
}
const STORE_OUT = {
  _id: ID(3),
  name: 'Mehr Menswear',
  logo: '',
  nearestKm: 1.4,
  branchCount: 2,
  branches: [{ _id: 'br2', blockId: OTHER_BLOCK._id, blockName: OTHER_BLOCK.name }],
  products: [{ _id: ID(4), name: 'Classic Kurta', price: 2500, image: '' }],
}

const cityValue = (over = {}) => ({
  cities: [
    { _id: 'c1', name: 'Faisalabad' },
    { _id: 'c2', name: 'Lahore' },
  ],
  city: { _id: 'c1', name: 'Faisalabad' },
  cityId: 'c1',
  setCityId: jest.fn(),
  ready: true,
  ...over,
})

const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } })

// Press the card whose accessibility label starts with `prefix` (store cards and product cards).
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
  api.get.mockReset()
})

describe('Home feed', () => {
  it('shows the shops in the chosen city, the shopper\'s block first, and a shelf from them', async () => {
    api.get.mockResolvedValue({ data: { items: [STORE_OUT, STORE_IN], meta: {} } })
    const renderer = await show(<Home />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id], areaName: BLOCK.name }) })

    expect(api.get).toHaveBeenCalledWith('/discover', { params: { cityId: 'c1', scope: 'city', limit: 6 } })

    const text = screenText(renderer)
    for (const expected of ['CityCart', 'Shopping in Faisalabad', 'Stores on your street', 'Loom & Co.', 'Mehr Menswear', 'Your block', 'From', 'Picked from your block', `Shops in ${BLOCK.name} come first.`]) {
      expect(text).toContain(expected)
    }
    // The shop with a branch in the chosen block is listed before the other one.
    expect(text.indexOf('Loom & Co.')).toBeLessThan(text.indexOf('Mehr Menswear'))
    // The shelf takes one product per shop, with the shop's name on each card.
    expect(text).toContain('Mehrunisa Printed Lawn')
    expect(text).toContain('Classic Kurta')
  })

  it('opens a store page and a product page from the feed', async () => {
    api.get.mockResolvedValue({ data: { items: [STORE_IN, STORE_OUT] } })
    const renderer = await show(<Home />, { city: cityValue() })

    await pressCard(renderer, 'Loom & Co.,')
    expect(mockRouter.push).toHaveBeenCalledWith(`/store/${STORE_IN._id}`)

    await pressCard(renderer, 'Mehrunisa Printed Lawn,')
    expect(mockRouter.push).toHaveBeenCalledWith(`/product/${ID(2)}`)
  })

  it('links to all stores and to the full Nearby search', async () => {
    api.get.mockResolvedValue({ data: { items: [STORE_IN, STORE_OUT] } })
    const renderer = await show(<Home />, { city: cityValue() })

    await press(renderer, 'All stores')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/brands')

    await press(renderer, 'Browse all')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/nearby')
  })

  it('asks for a city when none is chosen, and remembers the pick', async () => {
    const city = cityValue({ city: null, cityId: '' })
    const renderer = await show(<Home />, { city })

    const text = screenText(renderer)
    expect(text).toContain('Where are you shopping?')
    expect(text).toContain('Pick your city to see the shops and products around you.')
    expect(api.get).not.toHaveBeenCalled()

    await press(renderer, 'Lahore')
    expect(city.setCityId).toHaveBeenCalledWith('c2')
  })

  it('offers to try again when the feed cannot be loaded', async () => {
    api.get.mockRejectedValueOnce(httpError(503, 'The city feed is waking up.')).mockResolvedValueOnce({ data: { items: [STORE_IN] } })
    const renderer = await show(<Home />, { city: cityValue() })

    expect(screenText(renderer)).toContain("Couldn't load your city")
    expect(screenText(renderer)).toContain('The city feed is waking up.')

    await press(renderer, 'Try again')
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(screenText(renderer)).toContain('Loom & Co.')
  })

  it('says when a city has no stores yet and offers Nearby', async () => {
    api.get.mockResolvedValue({ data: { items: [] } })
    const renderer = await show(<Home />, { city: cityValue() })

    const text = screenText(renderer)
    expect(text).toContain('No stores in Faisalabad yet')
    expect(text).toContain('The block is still opening up.')

    await press(renderer, 'Browse nearby')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/nearby')
  })
})
