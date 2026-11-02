/**
 * The address book, screen by screen: the list (default, edit, delete), the new and
 * edit forms against the fake server, and the map rule that only delivery blocks can
 * be saved.
 */
import React from 'react'
import { Alert } from 'react-native'
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
jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')
  const MapView = React.forwardRef(({ children, onMapReady, onPress }, ref) => {
    React.useImperativeHandle(ref, () => ({ fitToCoordinates: jest.fn() }))
    React.useEffect(() => onMapReady && onMapReady(), [onMapReady])
    return <View testID="map" onPress={onPress}>{children}</View>
  })
  return { __esModule: true, default: MapView, Marker: () => null, Circle: () => null, Polygon: () => null }
})
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
import Addresses from '../src/app/addresses/index'
import AddressScreen from '../src/app/addresses/[id]'
import { cleanup, nearbyValue, press, screenText, show, signedIn, signedOut, tick, type } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BLOCK = { _id: ID(9), name: 'Gulberg', polygon: [[31.39, 73.09], [31.41, 73.09], [31.41, 73.11], [31.39, 73.11]] }
const POSITION = { lat: 31.4, lng: 73.1 }
const ADDRESS = {
  _id: ID(8),
  label: 'Home',
  isDefault: true,
  fullName: 'Sana Iqbal',
  phone: '+92 300 1234567',
  addressLine: 'House 41, Street 5',
  city: 'Faisalabad',
  postalCode: '38000',
  additionalInstructions: 'Blue gate',
  latitude: 31.4,
  longitude: 73.1,
  blocks: [BLOCK],
}

const inArea = () => nearbyValue({ blockIds: [BLOCK._id], selectedBlocks: [BLOCK], areaName: BLOCK.name, coords: POSITION, origin: POSITION, blocks: [BLOCK] })
const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { response: { status, data: { message, ...extra } } })

const fill = async (renderer, overrides = {}) => {
  const values = { Phone: '+92 300 1234567', 'Street address': 'House 41, Street 5', ...overrides }
  for (const [label, value] of Object.entries(values)) await type(renderer, label, value)
}

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  api.get.mockImplementation(async (url) => {
    if (url === '/addresses') return { data: { addresses: [] } }
    if (url === '/blocks/at') return { data: { containing: [BLOCK], nearest: [] } }
    throw new Error(`unexpected GET ${url}`)
  })
})

describe('Saved addresses list', () => {
  it('shows each address with its area, and offers to add another', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/addresses') return { data: { addresses: [ADDRESS, { ...ADDRESS, _id: ID(7), label: 'Office', isDefault: false, blocks: [] }] } }
      throw new Error(`unexpected GET ${url}`)
    })
    const renderer = await show(<Addresses />, { auth: signedIn(), nearby: inArea() })
    const text = screenText(renderer)
    expect(text).toContain('Home')
    expect(text).toContain('Default')
    expect(text).toContain('Gulberg')
    expect(text).toContain('Office')
    expect(text).toContain('We no longer deliver to this spot.')
    expect(text).toContain('Add address')

    await press(renderer, 'Add address')
    expect(mockRouter.push).toHaveBeenCalledWith('/addresses/new')
    await press(renderer, 'Edit')
    expect(mockRouter.push).toHaveBeenCalledWith(`/addresses/${ADDRESS._id}`)
  })

  it('makes another address the default, then reloads the list', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/addresses') return { data: { addresses: [{ ...ADDRESS, isDefault: false }] } }
      throw new Error(`unexpected GET ${url}`)
    })
    api.post.mockResolvedValue({ data: { address: ADDRESS } })
    const renderer = await show(<Addresses />, { auth: signedIn(), nearby: inArea() })
    await press(renderer, 'Make default')
    expect(api.post).toHaveBeenCalledWith(`/addresses/${ADDRESS._id}/default`)
    expect(api.get.mock.calls.filter(([url]) => url === '/addresses').length).toBe(2)
  })

  it('deletes only after the shopper confirms', async () => {
    api.get.mockImplementation(async (url) => (url === '/addresses' ? { data: { addresses: [ADDRESS] } } : (() => { throw new Error(`unexpected GET ${url}`) })()))
    api.delete.mockResolvedValue({ data: {} })
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const renderer = await show(<Addresses />, { auth: signedIn(), nearby: inArea() })

    await press(renderer, 'Delete')
    expect(api.delete).not.toHaveBeenCalled()
    const buttons = Alert.alert.mock.calls[0][2]
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Delete'])
    await act(async () => buttons[1].onPress())
    await tick()

    expect(api.delete).toHaveBeenCalledWith(`/addresses/${ADDRESS._id}`)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('says why a change was refused, and keeps the list', async () => {
    api.get.mockImplementation(async (url) => (url === '/addresses' ? { data: { addresses: [{ ...ADDRESS, isDefault: false }] } } : (() => { throw new Error(`unexpected GET ${url}`) })()))
    api.post.mockRejectedValue(httpError(409, 'You can save up to 10 addresses.'))
    const renderer = await show(<Addresses />, { auth: signedIn(), nearby: inArea() })
    await press(renderer, 'Make default')
    expect(screenText(renderer)).toContain('You can save up to 10 addresses.')
    expect(screenText(renderer)).toContain('Home')
  })

  it('invites a visitor to sign in, and returns them here', async () => {
    const renderer = await show(<Addresses />, { auth: signedOut() })
    expect(screenText(renderer)).toContain('Sign in to see your addresses')
    await press(renderer, 'Sign in')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/addresses' } })
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('New address form', () => {
  beforeEach(() => {
    mockParams = { id: 'new' }
  })

  it('starts at the shopper\'s area and saves the address there', async () => {
    api.post.mockResolvedValue({ data: { address: ADDRESS } })
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    // The form starts at the area the shopper already chose.
    expect(screenText(renderer)).toContain('Delivering to Gulberg')
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: POSITION })

    await fill(renderer)
    await press(renderer, 'Save address')

    expect(api.post).toHaveBeenCalledWith('/addresses', {
      label: 'Home',
      fullName: 'Sana Iqbal',
      phone: '+92 300 1234567',
      addressLine: 'House 41, Street 5',
      city: 'Faisalabad',
      latitude: POSITION.lat,
      longitude: POSITION.lng,
      isDefault: false,
    })
    expect(mockRouter.back).toHaveBeenCalled()
  })

  it('never saves a spot outside the delivery areas', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/addresses') return { data: { addresses: [] } }
      if (url === '/blocks/at') return { data: { containing: [], nearest: [{ _id: BLOCK._id, distanceKm: 0.4 }] } }
      throw new Error(`unexpected GET ${url}`)
    })
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    await fill(renderer)
    expect(screenText(renderer)).toContain('We do not deliver there yet. Tap inside a shaded area.')

    await press(renderer, 'Save address')
    expect(screenText(renderer)).toContain('We do not deliver to this spot yet. Tap inside a shaded area.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('checks the spot again when the shopper taps the map', async () => {
    api.post.mockResolvedValue({ data: { address: ADDRESS } })
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    const map = renderer.root.findAll((n) => n.props.testID === 'map' && typeof n.props.onPress === 'function')[0]
    await act(async () => map.props.onPress({ nativeEvent: { coordinate: { latitude: 31.4012, longitude: 73.1012 } } }))
    await tick()

    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.4012, lng: 73.1012 } })
    await fill(renderer)
    await press(renderer, 'Save address')
    expect(api.post.mock.calls[0][1]).toMatchObject({ latitude: 31.4012, longitude: 73.1012 })
  })

  it('asks for the missing details and sends nothing', async () => {
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    await press(renderer, 'Save address')
    const text = screenText(renderer)
    expect(text).toContain('Please check the highlighted fields.')
    expect(text).toContain('Enter a valid phone number')
    expect(text).toContain('Enter your street address.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows the field the server complained about, and lets the shopper retry', async () => {
    api.post.mockRejectedValue(httpError(400, 'Validation failed.', { errors: [{ field: 'phone', message: 'invalid phone number' }] }))
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    await fill(renderer)
    await press(renderer, 'Save address')
    expect(screenText(renderer)).toContain('Validation failed.')
    expect(screenText(renderer)).toContain('invalid phone number')
    expect(screenText(renderer)).toContain('Save address') // not stuck in "saving"
  })
})

describe('Edit address form', () => {
  beforeEach(() => {
    mockParams = { id: ADDRESS._id }
    api.get.mockImplementation(async (url) => {
      if (url === '/addresses') return { data: { addresses: [ADDRESS] } }
      if (url === '/blocks/at') return { data: { containing: [BLOCK], nearest: [] } }
      throw new Error(`unexpected GET ${url}`)
    })
  })

  it('starts from what is saved, including the pin', async () => {
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    const input = (label) => renderer.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0]
    expect(input('Name this address').props.value).toBe('Home')
    expect(input('Phone').props.value).toBe('+92 300 1234567')
    expect(input('Street address').props.value).toBe('House 41, Street 5')
    expect(input('Delivery notes (optional)').props.value).toBe('Blue gate')
    expect(screenText(renderer)).toContain('Delivering to Gulberg')
    expect(screenText(renderer)).toContain('This is your default address.')
  })

  it('saves the changes with PATCH', async () => {
    api.patch.mockResolvedValue({ data: { address: { ...ADDRESS, label: 'Office' } } })
    const renderer = await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() })
    await type(renderer, 'Name this address', 'Office')
    await press(renderer, 'Save changes')
    expect(api.patch).toHaveBeenCalledWith(`/addresses/${ADDRESS._id}`, expect.objectContaining({ label: 'Office', latitude: 31.4, longitude: 73.1 }))
    expect(mockRouter.back).toHaveBeenCalled()
  })

  it('says when the address disappeared on another device', async () => {
    api.get.mockImplementation(async (url) => (url === '/addresses' ? { data: { addresses: [] } } : { data: { containing: [BLOCK], nearest: [] } }))
    const text = screenText(await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() }))
    expect(text).toContain('Address not found')
  })

  it('offers to try again when the address cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('Cannot reach the server.'))
    const text = screenText(await show(<AddressScreen />, { auth: signedIn(), nearby: inArea() }))
    expect(text).toContain("Couldn't load this address")
    expect(text).toContain('Try again')
  })
})
