/**
 * The services tab against a fake server: providers in the shopper's area,
 * the city fallback, the empty/error states and the category and sort sheets.
 */
import React from 'react'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
const mockMaps = { views: [] }

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}), Redirect: () => null, Link: ({ children }) => children }))
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
jest.mock('../src/components/NearbyMap', () => {
  const React = require('react')
  const { View } = require('react-native')
  return function MockNearbyMap(props) {
    mockMaps.views.push(props)
    return <View testID="map" />
  }
})

import api from '../src/services/api'
import Services from '../src/app/(tabs)/services'
import { cleanup, nearbyValue, press, pressByLabel, screenText, show, tick, type } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BLOCK = { _id: 'block1', name: 'Gulberg' }
const LAHORE_BLOCK = { _id: 'block2', name: 'Model Town', latitude: 31.5, longitude: 74.3 }

const PROVIDER = {
  _id: ID(1),
  displayName: 'Ali Plumbing',
  slug: 'ali-plumbing',
  bio: 'Leaks, taps and bathroom fittings.',
  startingAtPrice: 150000,
  ratingAvg: 4.7,
  ratingCount: 21,
  completedBookings: 30,
  isNew: false,
  category: { _id: 'cat1', name: 'Plumbing', slug: 'plumbing' },
  block: { _id: BLOCK._id, name: BLOCK.name },
  district: null,
  city: { _id: 'c1', name: 'Faisalabad' },
  distanceKm: 0.4,
  offeringCount: 3,
  topOfferings: [
    { _id: 'o1', title: 'Tap repair' },
    { _id: 'o2', title: 'Leak fix' },
  ],
}
const CATEGORIES = [
  { _id: 'cat1', name: 'Plumbing', slug: 'plumbing' },
  { _id: 'cat2', name: 'Cleaning', slug: 'cleaning' },
]

let providers
let failDiscover
function serve() {
  providers = [PROVIDER]
  failDiscover = null
  api.get.mockImplementation(async (url, config) => {
    if (url === '/services/categories') return { data: { categories: CATEGORIES } }
    if (url === '/blocks') {
      return { data: { blocks: config.params?.cityId === 'c2' ? [LAHORE_BLOCK] : [BLOCK] } }
    }
    if (url === '/services/discover') {
      if (failDiscover) throw failDiscover
      const params = config.params
      return {
        data: {
          items: providers,
          pagination: { page: params.page, pages: 1, total: providers.length },
          meta: { scope: params.scope, radiusKm: params.radiusKm || null, totalOfferings: providers.length ? 3 : 0 },
        },
      }
    }
    throw new Error(`unexpected request ${url}`)
  })
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

const discoverCalls = () => api.get.mock.calls.filter(([url]) => url === '/services/discover').map(([, config]) => config.params)

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
  mockMaps.views.length = 0
  serve()
})

describe('Services discovery', () => {
  it('lists the providers in the shopper\'s blocks with prices and offerings', async () => {
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id], areaName: BLOCK.name }) })

    expect(discoverCalls()[0]).toMatchObject({ scope: 'area', blockIds: BLOCK._id, page: 1, limit: 12, sort: 'rank' })
    const text = screenText(renderer)
    for (const expected of ['Local services', 'Looking in Gulberg', 'Ali Plumbing', 'Plumbing · Gulberg', 'From', 'Rs 1,500', 'Tap repair', 'Leak fix', '+1 more', '1 provider · 3 services']) {
      expect(text).toContain(expected)
    }
  })

  it('opens the provider page from a card', async () => {
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id] }) })

    await pressCard(renderer, 'Ali Plumbing')
    expect(mockRouter.push).toHaveBeenCalledWith('/service/ali-plumbing')
  })

  it('widens to the whole city when no area is chosen', async () => {
    await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [] }) })
    expect(discoverCalls()[0]).toMatchObject({ scope: 'city', cityId: 'c1' })
  })

  it('asks for a city when there is none, and remembers the pick', async () => {
    const city = cityValue({ city: null, cityId: '' })
    const renderer = await show(<Services />, { city, nearby: nearbyValue({ blockIds: [] }) })

    expect(screenText(renderer)).toContain('Where should we look?')
    expect(discoverCalls()).toHaveLength(0)

    await press(renderer, 'Lahore')
    expect(city.setCityId).toHaveBeenCalledWith('c2')
  })

  it('suggests a wider range when the block has no providers', async () => {
    providers = []
    const nearby = nearbyValue({ blockIds: [BLOCK._id] })
    const renderer = await show(<Services />, { city: cityValue(), nearby })

    expect(screenText(renderer)).toContain('No providers within your block yet')
    await press(renderer, 'Try 5 km')
    expect(nearby.setRange).toHaveBeenCalledWith('5')
  })

  it('offers to try again when discovery fails', async () => {
    failDiscover = Object.assign(new Error('Services are waking up.'), { response: { status: 503, data: { message: 'Services are waking up.' } } })
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id] }) })

    expect(screenText(renderer)).toContain("Couldn't load services")
    expect(screenText(renderer)).toContain('Services are waking up.')
    expect(discoverCalls()).toHaveLength(1)

    failDiscover = null
    await press(renderer, 'Try again')
    expect(discoverCalls()).toHaveLength(2)
    expect(screenText(renderer)).toContain('Ali Plumbing')
  })

  it('filters by category from the sheet', async () => {
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id] }) })

    await press(renderer, 'All services')
    await press(renderer, 'Cleaning')
    expect(discoverCalls().at(-1)).toMatchObject({ categoryId: 'cat2' })
    expect(screenText(renderer)).toContain('Cleaning')
  })

  it('sorts from the sheet', async () => {
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id] }) })

    await press(renderer, 'Recommended')
    await press(renderer, 'Top rated')
    expect(discoverCalls().at(-1)).toMatchObject({ sort: 'rating' })
  })

  it('searches after the shopper stops typing', async () => {
    jest.useFakeTimers()
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id] }) })

    await type(renderer, 'Search a service or provider', 'plumber')
    await act(async () => { jest.advanceTimersByTime(400) })
    await tick()
    jest.useRealTimers()

    expect(discoverCalls().at(-1)).toMatchObject({ q: 'plumber' })
  })
})

describe('Services map', () => {
  const FAR_PROVIDER = { ...PROVIDER, _id: ID(2), displayName: 'Sana Cleaners', slug: 'sana-cleaners', block: { _id: 'block2', name: 'Model Town' } }

  it('draws provider pins city-wide, cycles each layer and recenters', async () => {
    providers = [PROVIDER, FAR_PROVIDER]
    const renderer = await show(<Services />, { city: cityValue(), nearby: nearbyValue({ blockIds: [BLOCK._id], blocks: [BLOCK] }) })

    await press(renderer, 'Map')
    let map = mockMaps.views.at(-1)
    expect(map.items).toEqual([])
    expect(map.providers.map((item) => item._id)).toEqual([ID(1), ID(2)])
    expect(map.zones).toEqual([BLOCK])

    const cityAsk = api.get.mock.calls.filter(([url, config]) => url === '/services/discover' && config.params.scope === 'city')
    expect(cityAsk.at(-1)[1].params).toMatchObject({ cityId: 'c1', limit: 30 })

    await pressByLabel(renderer, 'Providers: showing All. Tap to show only mine.')
    map = mockMaps.views.at(-1)
    expect(map.providers.map((item) => item._id)).toEqual([ID(1)])

    await pressByLabel(renderer, 'Blocks: showing All. Tap to show only mine.')
    await pressByLabel(renderer, 'Blocks: showing my block. Tap to show off.')
    expect(mockMaps.views.at(-1).zones).toEqual([])

    const before = mockMaps.views.at(-1).recenter
    await pressByLabel(renderer, 'Recenter')
    expect(mockMaps.views.at(-1).recenter).toBe(before + 1)

    mockMaps.views.at(-1).onOpenProvider(FAR_PROVIDER)
    expect(mockRouter.push).toHaveBeenCalledWith('/service/sana-cleaners')
  })

  it('sets the shopping spot from a tap only while choosing a location', async () => {
    const nearby = nearbyValue({ blockIds: [BLOCK._id], blocks: [BLOCK] })
    const renderer = await show(<Services />, { city: cityValue(), nearby })

    await press(renderer, 'Map')
    expect(mockMaps.views.at(-1).pickable).toBe(false)

    await pressByLabel(renderer, 'Choose location')
    expect(mockMaps.views.at(-1).pickable).toBe(true)
    await act(async () => mockMaps.views.at(-1).onPick(31.4, 73.1))
    await tick()

    expect(nearby.setPin).toHaveBeenCalledWith(31.4, 73.1)
  })

  it('frames another city without touching the saved area', async () => {
    const city = cityValue()
    const renderer = await show(<Services />, { city, nearby: nearbyValue({ blockIds: [BLOCK._id], blocks: [BLOCK] }) })

    await press(renderer, 'Map')
    await pressByLabel(renderer, 'City shown on the map: Faisalabad. Tap to change.')
    await press(renderer, 'Lahore')
    await tick()

    expect(city.setCityId).toHaveBeenCalledWith('c2')
    expect(api.get).toHaveBeenCalledWith('/blocks', { params: { cityId: 'c2', isActive: true } })
    expect(mockMaps.views.at(-1).focus.bounds).toEqual({ south: 31.5, north: 31.5, west: 74.3, east: 74.3 })
  })
})
