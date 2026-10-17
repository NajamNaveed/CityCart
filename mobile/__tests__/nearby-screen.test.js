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
const mockMapProps = { markers: [], circles: [], fit: jest.fn() }

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
jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')
  const MapView = React.forwardRef(({ children, onMapReady }, ref) => {
    React.useImperativeHandle(ref, () => ({ fitToCoordinates: mockMapProps.fit }))
    React.useEffect(() => onMapReady && onMapReady(), [onMapReady])
    return <View testID="map">{children}</View>
  })
  const Marker = (props) => {
    mockMapProps.markers.push(props)
    return null
  }
  const Circle = (props) => {
    mockMapProps.circles.push(props)
    return null
  }
  return { __esModule: true, default: MapView, Marker, Circle }
})

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import { CityProvider } from '../src/context/CityProvider'
import { NearbyProvider } from '../src/context/NearbyProvider'
import Nearby from '../src/app/(tabs)/nearby'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const CITY = { _id: ID(9), name: 'Faisalabad' }
const GULBERG = { _id: ID(4), name: 'Gulberg' }
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
function serve() {
  discoverItems = [BRAND]
  api.get.mockImplementation(async (url, config) => {
    if (url === '/cities') return { data: { cities: [CITY] } }
    if (url === '/blocks') return { data: { blocks: [GULBERG] } }
    if (url === '/blocks/resolve') return { data: { block: GULBERG, city: CITY } }
    if (url === '/discover') {
      const radius = config.params.scope === 'radius' ? Number(config.params.radiusKm) : null
      return {
        data: {
          items: discoverItems,
          pagination: { page: 1, pages: 1, total: discoverItems.length },
          meta: { scope: config.params.scope, radiusKm: radius, origin: { lat: 31.4, lng: 73.1 }, block: GULBERG, totalBranches: discoverItems.length ? 2 : 0 },
        },
      }
    }
    throw new Error(`unexpected request ${url}`)
  })
}

const tick = async (times = 6) => {
  for (let i = 0; i < times; i += 1) await act(async () => { await Promise.resolve() })
}

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
  mockMapProps.markers.length = 0
  mockMapProps.circles.length = 0
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
    expect(api.get).toHaveBeenCalledWith('/blocks/resolve', { params: { lat: 31.401, lng: 73.101 } })
    const text = screenText(renderer)
    expect(text).toContain('Gulberg') // the chip shows the block
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('1.2 km away · 2 branches')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'block', blockId: GULBERG._id, cityId: CITY._id, lat: 31.401, lng: 73.101 })
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
  beforeEach(() => remember({ nearby: { blockId: GULBERG._id, coords: null, range: 'block' } }))

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
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'radius', radiusKm: '5', blockId: GULBERG._id })
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby')).range).toBe('5')
    await press(renderer, 'Whole city')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'city' })
  })

  it('suggests a wider range when nothing is found, and uses it', async () => {
    await AsyncStorage.setItem('citycart.nearbyAsked', 'true')
    discoverItems = []
    const renderer = await open()
    expect(screenText(renderer)).toContain('No shops within this block yet')
    await press(renderer, 'Try 5 km')
    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'radius', radiusKm: '5' })
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
    const pins = mockMapProps.markers.filter((m) => m.title === BRAND.name)
    expect(pins).toHaveLength(2) // one per branch
    expect(pins[0].coordinate).toEqual({ latitude: 31.401, longitude: 73.101 })
    expect(mockMapProps.fit).toHaveBeenCalled()
    expect(mockMapProps.circles).toHaveLength(0)

    mockMapProps.circles.length = 0
    await press(renderer, '10 km')
    expect(mockMapProps.circles.at(-1)).toMatchObject({ radius: 10000, center: { latitude: 31.4, longitude: 73.1 } })

    // tapping a pin's label goes to that brand's products
    pins[0].onCalloutPress()
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

    expect(discoverCalls().at(-1)).toMatchObject({ scope: 'block', blockId: GULBERG._id })
    expect(discoverCalls().at(-1)).not.toHaveProperty('lat')
    expect(JSON.parse(await AsyncStorage.getItem('citycart.nearby'))).toMatchObject({ blockId: GULBERG._id, coords: null })
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
