/**
 * The Nearby screen against a fake server, a fake position and a fake map:
 * the first-visit flow, a remembered area, the range pills, empty results and the map view.
 */
import React from 'react'
import { Linking, Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import TestRenderer, { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
const mockMapProps = { scripts: [], onMessage: null }
const lastMapData = () => {
  const script = mockMapProps.scripts.at(-1)
  return JSON.parse(script.slice(script.indexOf('renderMap(', script.indexOf('&&') + 2) + 'renderMap('.length, script.lastIndexOf('); true;')))
}

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
jest.mock('react-native-webview', () => {
  const React = require('react')
  const { View } = require('react-native')
  const WebView = React.forwardRef(({ onLoadEnd, onMessage }, ref) => {
    mockMapProps.onMessage = onMessage
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (script) => mockMapProps.scripts.push(script) }))
    React.useEffect(() => onLoadEnd && onLoadEnd(), [onLoadEnd])
    return <View testID="map" />
  })
  return { __esModule: true, WebView }
})

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import { CityProvider } from '../src/context/CityProvider'
import { NearbyProvider } from '../src/context/NearbyProvider'
import Nearby from '../src/app/(tabs)/nearby'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const CITY = { _id: ID(9), name: 'Faisalabad' }
const GULBERG = { _id: ID(4), name: 'Gulberg', cityId: CITY._id, latitude: 31.4, longitude: 73.1, polygon: [[31.39, 73.09], [31.39, 73.11], [31.41, 73.11], [31.41, 73.09]] }
const DGROUND = { _id: ID(7), name: 'D Ground', cityId: CITY._id, latitude: 31.405, longitude: 73.105, polygon: [[31.395, 73.1], [31.395, 73.12], [31.415, 73.12], [31.415, 73.1]] }
const GHEE = {
  catalogProductId: ID(8),
  name: 'Dalda Ghee 1 kg',
  manufacturer: 'Dalda',
  size: { value: 1, unit: 'kg' },
  images: [],
  minPrice: 1180,
  maxPrice: 1250,
  offerCount: 2,
  inStock: true,
  offers: [
    { productId: ID(2), brandId: ID(1), brandName: 'Cheap Mart', price: 1180, availability: 'IN_STOCK', branchCount: 1, nearestKm: 0.8 },
    { productId: ID(3), brandId: ID(1), brandName: 'Near Mart', price: 1250, availability: 'IN_STOCK', branchCount: 2, nearestKm: 0.2 },
  ],
}
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

let discoverItems
let blocksAt // the answer to "which blocks am I in?"
function serve() {
  discoverItems = [BRAND]
  blocksAt = { containing: [GULBERG], nearest: [DGROUND] }
  api.get.mockImplementation(async (url, config) => {
    if (url === '/cities') return { data: { cities: [CITY] } }
    if (url === '/blocks') return { data: { blocks: [GULBERG, DGROUND] } }
    if (url === '/blocks/at') return { data: blocksAt }
    if (url === '/catalog/browse') return { data: { items: [GHEE], pagination: { page: 1, pages: 1, total: 1 }, meta: {} } }
    if (url === '/discover') {
      return {
        data: {
          items: discoverItems,
          pagination: { page: 1, pages: 1, total: discoverItems.length },
          meta: { scope: config.params.scope, radiusKm: config.params.radiusKm ? Number(config.params.radiusKm) : null, origin: { lat: 31.4, lng: 73.1 }, block: GULBERG, totalBranches: discoverItems.length ? 2 : 0 },
        },
      }
    }
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

// Press the control whose label is `label` (chips, buttons and tabs are Pressables around a Text).
async function press(renderer, label) {
  const target = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t) === label))[0]
  if (!target) throw new Error(`nothing to press labelled "${label}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

async function remember({ city = true, nearby } = {}) {
  if (city) await AsyncStorage.setItem('citycart.cityId', JSON.stringify(CITY._id))
  if (nearby) await AsyncStorage.setItem('citycart.nearby', JSON.stringify(nearby))
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockMapProps.scripts.length = 0
  await AsyncStorage.clear()
  serve()
})

describe('first visit', () => {
  it('asks for the position once, finds the block, and shows the shops around it', async () => {
    jest.useFakeTimers()
    await remember({ city: false })
    getShopperPosition.mockResolvedValue({ lat: 31.401, lng: 73.101 })
    const renderer = await open()
    await act(async () => { jest.advanceTimersByTime(800) })
    await tick(10)
    jest.useRealTimers()

    expect(getShopperPosition).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.401, lng: 73.101 } })
    const text = screenText(renderer)
    expect(text).toContain('Gulberg') // the chip shows the block
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('1.2 km away · 2 branches')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: GULBERG._id, lat: 31.401, lng: 73.101 })
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
  beforeEach(() => remember({ nearby: { blockIds: [GULBERG._id], coords: null, pinned: false, range: 'block' } }))

  it('lists the brand with its branches, distances and products', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const text = screenText(await open())
    expect(text).toContain('1 brand with 2 branches')
    expect(text).toContain('within your block')
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
    // no position was shared, so the range is measured from the block's centre
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', radiusKm: '5', blockIds: GULBERG._id, lat: 31.4, lng: 73.1 })
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby')).range).toBe('5')
    await press(renderer, 'Whole city')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'city' })
  })

  it('suggests a wider range when nothing is found, and uses it', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    discoverItems = []
    const renderer = await open()
    expect(screenText(renderer)).toContain('No shops within your block yet')
    await press(renderer, 'Try 5 km')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', radiusKm: '5' })
  })

  it('opens the brand\'s products from "See all products"', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'See all products')
    expect(mockRouter.navigate).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/shop', params: expect.objectContaining({ brandId: BRAND._id }) }))
  })

  it('shows the shops on a map, with a circle for a radius search', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'Map')
    expect(renderer.root.findAllByProps({ testID: 'map' }).length).toBeGreaterThan(0)
    const first = lastMapData()
    expect(first.pins.filter((p) => p.title === BRAND.name)).toHaveLength(2) // one per branch
    expect(first.pins[0]).toMatchObject({ lat: 31.401, lng: 73.101, brandId: BRAND._id })
    expect(first.radiusKm).toBeNull()
    expect(first.zones).toEqual([expect.objectContaining({ name: 'Gulberg', selected: true, polygon: GULBERG.polygon })]) // the block being searched is outlined

    await press(renderer, '10 km')
    expect(lastMapData()).toMatchObject({ radiusKm: 10, origin: { lat: 31.4, lng: 73.1 } })

    // tapping a pin's button goes to that brand's products
    mockMapProps.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'brand', id: BRAND._id }) } })
    expect(mockRouter.navigate).toHaveBeenCalled()
  })
})

describe('the location sheet', () => {
  it('explains a blocked permission and offers the phone\'s settings', async () => {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    getShopperPosition.mockRejectedValue(Object.assign(new Error('denied'), { code: 'DENIED', canAskAgain: false }))
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
    const renderer = await open()

    await press(renderer, 'Faisalabad') // the location chip opens the sheet
    await press(renderer, 'Use my current location')
    const text = screenText(renderer)
    expect(text).toContain('Location is blocked for CityCart')
    expect(text).toContain('Open Settings')

    await press(renderer, 'Open Settings')
    expect(openSettings).toHaveBeenCalledTimes(1)
  })

  it('lets the shopper pick an area by hand, and remembers it without a position', async () => {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()

    await press(renderer, 'Faisalabad')
    await press(renderer, 'Gulberg') // a row in the list of areas

    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: GULBERG._id, lat: 31.4, lng: 73.1 }) // measured from the block's centre
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby'))).toMatchObject({ blockIds: [GULBERG._id], coords: null, pinned: false })
    expect(getShopperPosition).not.toHaveBeenCalled() // choosing by hand never asks for the position
  })
})

describe('no area chosen yet', () => {
  it('searches the whole city and says why', async () => {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const text = screenText(await open())
    expect(text).toContain('Choose your area to search your block')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'city' })
  })
})

describe('one position, several blocks', () => {
  async function openSheetAfterDetect() {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'Faisalabad')
    await press(renderer, 'Use my current location')
    return renderer
  }

  it('ticks every block of an overlap, lets the shopper untick one, and keeps at least one', async () => {
    getShopperPosition.mockResolvedValue({ lat: 31.403, lng: 73.102 })
    blocksAt = { containing: [GULBERG, DGROUND], nearest: [] }
    const renderer = await openSheetAfterDetect()

    expect(screenText(renderer)).toContain('This spot is in 2 blocks')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: `${GULBERG._id},${DGROUND._id}`, lat: 31.403, lng: 73.102 })

    await press(renderer, 'D Ground') // untick one: the position is kept
    expect(discoverCalls().at(-1)).toMatchObject({ blockIds: GULBERG._id, lat: 31.403 })
    await press(renderer, 'Gulberg') // the last block stays ticked
    expect(discoverCalls().at(-1)).toMatchObject({ blockIds: GULBERG._id })
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby')).blockIds).toEqual([GULBERG._id])
  })

  it('offers the nearest blocks between zones, and searches the ones the shopper picks', async () => {
    getShopperPosition.mockResolvedValue({ lat: 31.42, lng: 73.09 })
    blocksAt = { containing: [], nearest: [{ ...GULBERG, distanceKm: 0.6 }, { ...DGROUND, distanceKm: 1.1 }] }
    const renderer = await openSheetAfterDetect()

    expect(screenText(renderer)).toContain('This spot is between blocks')
    expect(screenText(renderer)).toContain('Gulberg · 600 m') // how far each one is
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'city' }) // nothing chosen yet

    await press(renderer, 'Gulberg · 600 m')
    await press(renderer, 'D Ground · 1.1 km')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: `${GULBERG._id},${DGROUND._id}`, lat: 31.42, lng: 73.09 })
  })

  it('lets the shopper shop somewhere else by dropping a pin on the map', async () => {
    await remember({ nearby: { blockIds: [GULBERG._id], coords: { lat: 31.4, lng: 73.1 }, pinned: false, range: 'block' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    blocksAt = { containing: [DGROUND], nearest: [] }
    const renderer = await open()
    await press(renderer, 'Gulberg')
    await press(renderer, 'Pick a spot on the map')

    const map = lastMapData()
    expect(map).toMatchObject({ pickable: true, fitOnce: true, pin: null })
    expect(map.zones.map((z) => z.name)).toEqual(['Gulberg', 'D Ground']) // every block, outlined
    expect(map.zones.find((z) => z.name === 'Gulberg').selected).toBe(true)

    await act(async () => mockMapProps.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pick', lat: 31.40512345, lng: 73.10512345 }) } }))
    await tick()

    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.40512, lng: 73.10512 } })
    expect(getShopperPosition).not.toHaveBeenCalled()
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby'))).toMatchObject({ blockIds: [DGROUND._id], pinned: true, coords: { lat: 31.40512, lng: 73.10512 } })
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: DGROUND._id })
    expect(lastMapData().pin).toEqual({ lat: 31.40512, lng: 73.10512 })
  })

  it('says so when the dropped pin is nowhere we deliver', async () => {
    await remember({ nearby: { blockIds: [GULBERG._id], coords: null, pinned: false, range: 'block' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    blocksAt = { containing: [], nearest: [] }
    const renderer = await open()
    await press(renderer, 'Gulberg')
    await press(renderer, 'Pick a spot on the map')
    await act(async () => mockMapProps.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pick', lat: 10, lng: 10 }) } }))
    await tick()
    expect(screenText(renderer)).toContain("We don't serve this spot yet")
    // the earlier area is untouched
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby')).blockIds).toEqual([GULBERG._id])
  })

  it('lets the shopper choose more than one area by hand', async () => {
    await remember({})
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    const renderer = await open()
    await press(renderer, 'Faisalabad')
    await press(renderer, 'Gulberg')
    await press(renderer, 'D Ground')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'area', blockIds: `${GULBERG._id},${DGROUND._id}` })
    expect(discoverCalls().at(-1)).not.toHaveProperty('lat') // two blocks have no single centre to measure from
    await press(renderer, 'Gulberg') // tapping again unchooses it
    expect(discoverCalls().at(-1)).toMatchObject({ blockIds: DGROUND._id })
  })
})

describe('products in the area', () => {
  beforeEach(async () => {
    await remember({ nearby: { blockIds: [GULBERG._id], coords: { lat: 31.4, lng: 73.1 }, pinned: false, range: '5' } })
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
  })

  it('shows each product once with its stores, and compares them', async () => {
    const renderer = await open()
    await press(renderer, 'Products')

    const call = api.get.mock.calls.filter(([url]) => url === '/catalog/browse').at(-1)[1].params
    expect(call).toMatchObject({ blockIds: GULBERG._id, sort: 'name', lat: 31.4, lng: 73.1, radiusKm: '5', page: 1 })
    let text = screenText(renderer)
    expect(text).toContain('Dalda Ghee 1 kg')
    expect(text).toContain('Dalda · 1 kg')
    expect(text).toContain('from Rs 1,180')
    expect(text).toContain('2 stores')
    expect(text).not.toContain('Cheap Mart') // the offers stay folded away until asked

    await press(renderer, 'Compare 2 stores')
    text = screenText(renderer)
    expect(text).toContain('Cheap Mart')
    expect(text).toContain('Rs 1,250')
    expect(text).toContain('800 m away')

    const offer = renderer.root.findAll((n) => n.props.accessibilityRole === 'link' && String(n.props.accessibilityLabel).startsWith('Cheap Mart'))[0]
    await act(async () => offer.props.onPress())
    expect(mockRouter.push).toHaveBeenCalledWith(`/product/${GHEE.offers[0].productId}`)
  })

  it('can sort by lowest price, or by the nearest store when the shopper has a position', async () => {
    const renderer = await open()
    await press(renderer, 'Products')
    await press(renderer, 'Lowest price')
    expect(api.get.mock.calls.filter(([url]) => url === '/catalog/browse').at(-1)[1].params.sort).toBe('price')
    await press(renderer, 'Nearest store')
    expect(api.get.mock.calls.filter(([url]) => url === '/catalog/browse').at(-1)[1].params.sort).toBe('nearest')
  })

  it('asks the shopper to choose an area when there is none', async () => {
    await AsyncStorage.setItem('citycart.nearby', JSON.stringify({ blockIds: [], coords: null, pinned: false, range: 'block' }))
    const renderer = await open()
    await press(renderer, 'Products')
    expect(screenText(renderer)).toContain('Choose your area to compare products across the stores near you')
    expect(api.get.mock.calls.some(([url]) => url === '/catalog/browse')).toBe(false)
  })
})
