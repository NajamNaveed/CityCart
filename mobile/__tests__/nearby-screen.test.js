/**
 * The Nearby screen against a fake server, a fake position and a fake map:
 * the first-visit flow, remembered areas (single, overlap and a dropped pin),
 * the range pills, the products view, and the location sheet.
 */
import React from 'react'
import { Linking, Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import TestRenderer, { act } from 'react-test-renderer'

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
  default: { get: jest.fn(), post: jest.fn() },
  getErrorMessage: (e) => e?.message || 'Something went wrong.',
  getFieldErrors: () => ({}),
  setUnauthorizedHandler: jest.fn(),
}))
jest.mock('../src/services/location', () => ({ getShopperPosition: jest.fn() }))
jest.mock('../src/components/NearbyMap', () => {
  const React = require('react')
  const { View } = require('react-native')
  return function MockNearbyMap(props) {
    mockMaps.views.push(props)
    return <View testID="map" />
  }
})

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import { CityProvider } from '../src/context/CityProvider'
import { NearbyProvider } from '../src/context/NearbyProvider'
import LocationSheet from '../src/components/LocationSheet'
import Nearby from '../src/app/(tabs)/nearby'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const CITY = { _id: ID(9), name: 'Faisalabad' }
const GULBERG = { _id: ID(4), name: 'Gulberg', cityId: CITY._id, polygon: [[31.39, 73.09], [31.41, 73.09], [31.41, 73.11], [31.39, 73.11]] }
const DGROUND = { _id: ID(7), name: 'D Ground', cityId: CITY._id, polygon: [[31.42, 73.07], [31.44, 73.07], [31.44, 73.09], [31.42, 73.09]] }
const POSITION = { lat: 31.4, lng: 73.1 }
const BRAND = {
  _id: ID(1),
  name: 'Loom & Co.',
  logo: '',
  nearestKm: 1.2,
  branchCount: 2,
  branches: [
    { _id: ID(5), name: 'Loom & Co. Gulberg', blockName: 'Gulberg', address: 'Plot 31, Main Boulevard', phone: '+92 41 8714 305', distanceKm: 1.2, latitude: 31.401, longitude: 73.101 },
    { _id: ID(6), name: 'Loom & Co. D Ground', blockName: 'D Ground', address: 'Shop 7', phone: '', distanceKm: 3.4, latitude: 31.43, longitude: 73.09 },
  ],
  products: [{ _id: ID(2), name: 'Mehrunisa Printed Lawn', price: 3600, image: '', availability: 'IN_STOCK', availableAt: ['Gulberg'] }],
}
const CATALOG = {
  catalogProductId: ID(3),
  name: 'Mehrunisa Printed Lawn',
  manufacturer: 'Mehrunisa',
  size: { value: '3', unit: 'm' },
  images: [],
  minPrice: 3200,
  offerCount: 2,
  inStock: true,
  offers: [
    { productId: ID(2), brandName: 'Loom & Co.', price: 3200, nearestKm: 1.2, branchCount: 2, availability: 'IN_STOCK' },
    { productId: ID(8), brandName: 'Mehr Textiles', price: 3400, nearestKm: 2.1, branchCount: 1, availability: 'IN_STOCK' },
  ],
}

let discoverItems
let catalogItems
let atResult
function serve() {
  discoverItems = [BRAND]
  catalogItems = [CATALOG]
  atResult = { containing: [GULBERG], nearest: [] }
  api.get.mockImplementation(async (url, config) => {
    if (url === '/cities') return { data: { cities: [CITY] } }
    if (url === '/blocks') return { data: { blocks: [GULBERG, DGROUND] } }
    if (url === '/blocks/at') {
      if (atResult instanceof Error) throw atResult
      return { data: atResult }
    }
    if (url === '/discover') {
      const params = config.params
      return {
        data: {
          items: discoverItems,
          pagination: { page: 1, pages: 1, total: discoverItems.length },
          meta: {
            scope: params.scope,
            radiusKm: params.radiusKm || null,
            origin: params.lat ? { lat: Number(params.lat), lng: Number(params.lng) } : null,
            totalBranches: discoverItems.length ? 2 : 0,
          },
        },
      }
    }
    if (url === '/catalog/browse') return { data: { items: catalogItems, pagination: { page: 1, pages: 1, total: catalogItems.length }, meta: {} } }
    throw new Error(`unexpected request ${url}`)
  })
}

const tick = async (times = 6) => {
  for (let i = 0; i < times; i += 1) await act(async () => { await Promise.resolve() })
}

const opened = []
afterEach(async () => {
  while (opened.length) {
    const renderer = opened.pop()
    await act(async () => renderer.unmount())
  }
})

async function open() {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(
      <CityProvider>
        <NearbyProvider>
          <Nearby />
          <LocationSheet />
        </NearbyProvider>
      </CityProvider>,
    )
  })
  opened.push(renderer)
  await tick()
  return renderer
}

const textOf = (node) => [].concat(node.props.children).flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
const screenText = (renderer) => renderer.root.findAllByType(Text).map(textOf).join(' | ')
const discoverCalls = () => api.get.mock.calls.filter(([url]) => url === '/discover').map(([, config]) => config.params)
const catalogCalls = () => api.get.mock.calls.filter(([url]) => url === '/catalog/browse').map(([, config]) => config.params)

async function press(renderer, label) {
  const target = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t) === label))[0]
  if (!target) throw new Error(`nothing to press labelled "${label}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

async function pressByLabel(renderer, label) {
  const target = renderer.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]
  if (!target) throw new Error(`no control with accessibility label "${label}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

async function remember({ city = true, nearby } = {}) {
  if (city) await AsyncStorage.setItem('citycart.cityId', JSON.stringify(CITY._id))
  if (nearby) await AsyncStorage.setItem('citycart.nearby', JSON.stringify(nearby))
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockMaps.views.length = 0
  await AsyncStorage.clear()
  serve()
})

describe('first visit', () => {
  it('asks for the position once, finds the block, and shows the shops around it', async () => {
    jest.useFakeTimers()
    await remember({ city: false })
    getShopperPosition.mockResolvedValue(POSITION)
    const renderer = await open()
    await act(async () => { jest.advanceTimersByTime(800) })
    await tick(10)
    jest.useRealTimers()

    expect(getShopperPosition).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: POSITION })
    const text = screenText(renderer)
    expect(text).toContain('Gulberg') // the chip shows the area
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('1.2 km away · 2 branches')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: GULBERG._id, cityId: CITY._id, lat: 31.4, lng: 73.1 })
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearbyAsked'))).toBe(true)
  })

  it('does not ask again on a later visit', async () => {
    jest.useFakeTimers()
    await remember({ city: false })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    await open()
    await act(async () => { jest.advanceTimersByTime(2000) })
    await tick()
    jest.useRealTimers()
    expect(getShopperPosition).not.toHaveBeenCalled()
  })

  it('offers to share the location or choose manually when there is no city yet', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const text = screenText(await open())
    expect(text).toContain('Where are you shopping?')
    expect(text).toContain('Use my location')
    expect(text).toContain('Choose manually')
    expect(discoverCalls()).toHaveLength(0)
  })
})

describe('a remembered area', () => {
  beforeEach(() => remember({ nearby: { blockIds: [GULBERG._id], coords: POSITION, pinned: false, range: 'block' } }))

  it('lists the brand with its branches, distances and products', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const text = screenText(await open())
    expect(text).toContain('1 brand with 2 branches')
    expect(text).toContain('within this block')
    expect(text).toContain('Loom & Co. Gulberg')
    expect(text).toContain('Plot 31, Main Boulevard')
    expect(text).toContain('Directions')
    expect(text).toContain('Call')
    expect(text).toContain('Show 1 more branch')
    expect(text).toContain('Mehrunisa Printed Lawn')
    expect(text).toContain('Rs 3,600')
    expect(text).toContain('Only at Gulberg')
    expect(text).toContain('See all products')
  })

  it('searches again with a radius when a range pill is pressed', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, '5 km')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', radiusKm: '5', blockIds: GULBERG._id })
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby')).range).toBe('5')
    await press(renderer, 'Whole city')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'city' })
    expect(discoverCalls().at(-1)).not.toHaveProperty('blockIds')
  })

  it('suggests a wider range when nothing is found, and uses it', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    discoverItems = []
    const renderer = await open()
    expect(screenText(renderer)).toContain('No shops within this block yet')
    await press(renderer, 'Try 5 km')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', radiusKm: '5' })
  })

  it('opens the brand\'s products from "See all products"', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'See all products')
    expect(mockRouter.navigate).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/shop', params: expect.objectContaining({ brandId: BRAND._id }) }))
  })

  it('shows the shops on a map, with a radius for a radius search', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'Map')
    expect(renderer.root.findAllByProps({ testID: 'map' }).length).toBeGreaterThan(0)
    let map = mockMaps.views.at(-1)
    expect(map.items).toEqual([BRAND])
    expect(map.zones).toEqual([GULBERG]) // the chosen block is shaded
    expect(map.radiusKm).toBeNull()
    expect(map.origin).toEqual(POSITION)

    await press(renderer, '10 km')
    map = mockMaps.views.at(-1)
    expect(map.radiusKm).toBe('10')

    // tapping a shop pin's "See products" goes to that brand
    map.onOpenBrand(BRAND)
    expect(mockRouter.navigate).toHaveBeenCalled()
  })
})

describe('choosing blocks by hand', () => {
  it('takes every block in an overlap', async () => {
    await remember({ nearby: { blockIds: [GULBERG._id, DGROUND._id], coords: null, pinned: false, range: 'block' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    expect(screenText(renderer)).toContain('within your blocks')
    expect(screenText(renderer)).toContain('These blocks')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: `${GULBERG._id},${DGROUND._id}` })
    expect(discoverCalls().at(-1)).not.toHaveProperty('lat')
  })

  it('lets the shopper pick an area by hand, and remembers it without a position', async () => {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()

    await pressByLabel(renderer, 'Location: Faisalabad. Change')
    await press(renderer, 'Faisalabad') // the city chip in the sheet
    await press(renderer, 'Gulberg') // a row in the list of areas

    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: GULBERG._id })
    expect(discoverCalls().at(-1)).not.toHaveProperty('lat')
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby'))).toMatchObject({ blockIds: [GULBERG._id], coords: null })
    expect(getShopperPosition).not.toHaveBeenCalled() // choosing by hand never asks for the position
  })

  it('uses a pin dropped on the sheet\'s map', async () => {
    await remember({ nearby: { blockIds: [GULBERG._id], coords: POSITION, pinned: false, range: 'block' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    atResult = { containing: [DGROUND], nearest: [] }
    const renderer = await open()

    await pressByLabel(renderer, 'Location: Gulberg, Faisalabad. Change')
    await press(renderer, 'Pick a spot on the map')
    const map = mockMaps.views.at(-1)
    await act(async () => map.onPick(31.43, 73.08))
    await tick()

    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.43, lng: 73.08 } })
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: DGROUND._id, lat: 31.43, lng: 73.08 })
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby'))).toMatchObject({ blockIds: [DGROUND._id], coords: { lat: 31.43, lng: 73.08 }, pinned: true })
  })
})

describe('the location sheet', () => {
  it('explains a blocked permission and offers the phone\'s settings', async () => {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    getShopperPosition.mockRejectedValue(Object.assign(new Error('denied'), { code: 'DENIED', canAskAgain: false }))
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    const renderer = await open()

    await pressByLabel(renderer, 'Location: Faisalabad. Change')
    await press(renderer, 'Use my current location')
    const text = screenText(renderer)
    expect(text).toContain('Location is blocked for CityCart')
    expect(text).toContain('Open Settings')

    await press(renderer, 'Open Settings')
    expect(openSettings).toHaveBeenCalledTimes(1)
  })
})

describe('the products view', () => {
  it('compares one catalogue product across the stores in the area', async () => {
    await remember({ nearby: { blockIds: [GULBERG._id], coords: POSITION, pinned: false, range: 'block' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'Products')

    expect(catalogCalls().at(-1)).toMatchObject({ blockIds: GULBERG._id, sort: 'name', page: 1, limit: 12, lat: 31.4, lng: 73.1 })
    const text = screenText(renderer)
    expect(text).toContain('Mehrunisa Printed Lawn')
    expect(text).toContain('from Rs 3,200')
    expect(text).toContain('2 stores')
    expect(text).toContain('Compare 2 stores')

    await press(renderer, 'Compare 2 stores')
    expect(screenText(renderer)).toContain('Mehr Textiles')
    await pressByLabel(renderer, 'Mehr Textiles, Rs 3,400, open this store\'s product')
    expect(mockRouter.push).toHaveBeenCalledWith(`/product/${ID(8)}`)

    await press(renderer, 'Lowest price')
    expect(catalogCalls().at(-1)).toMatchObject({ sort: 'price' })
  })

  it('asks for an area before comparing products', async () => {
    await remember({ nearby: { blockIds: [], coords: null, pinned: false, range: 'block' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'Products')
    expect(screenText(renderer)).toContain('Choose your area to compare products')
    await press(renderer, 'Choose area')
    expect(screenText(renderer)).toContain('Where are you shopping?')
  })
})
