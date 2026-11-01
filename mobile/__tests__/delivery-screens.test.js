/**
 * Where an order goes: saved addresses and the delivery pin at checkout, the cart's warning
 * about items a store cannot deliver to the chosen area, and the saved-addresses screen.
 */
import React from 'react'
import { Alert, Text } from 'react-native'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
const mockRedirects = []

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (callback) => React.useEffect(callback, []),
    Redirect: ({ href }) => {
      mockRedirects.push(href)
      return null
    },
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
  getFieldErrors: (e) => Object.fromEntries((e?.response?.data?.errors || []).map((x) => [x.field, x.message])),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import { __map, lastMapData } from 'react-native-webview'
import { takePlacedOrders, rememberPlacedOrders } from '../src/services/orders'
import CartScreen from '../src/app/(tabs)/cart'
import Checkout from '../src/app/checkout'
import Addresses from '../src/app/addresses'
import { cleanup, nearbyValue, press, screenText, show, signedIn, textOf, type } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const D_GROUND = { _id: ID(9), name: 'D Ground', cityId: 'c1', latitude: 31.405, longitude: 73.095, polygon: [[31.4, 73.09], [31.4, 73.1], [31.41, 73.1], [31.41, 73.09]] }
const PEOPLES = { _id: ID(8), name: 'Peoples Colony', cityId: 'c1', latitude: 31.4, longitude: 73.1, polygon: [[31.395, 73.095], [31.395, 73.105], [31.405, 73.105], [31.405, 73.095]] }
const LAWN = { productId: ID(2), name: 'Mehrunisa Printed Lawn', image: '', unitPrice: 3600, quantity: 2, lineTotal: 7200 }
const KURTA = { productId: ID(3), name: 'Classic Kurta', image: '', unitPrice: 2500, quantity: 1, lineTotal: 2500 }
const cartOf = (...groups) => ({ groups, itemCount: groups.flatMap((g) => g.items).reduce((n, i) => n + i.quantity, 0), subtotal: groups.reduce((n, g) => n + g.subtotal, 0) })
const LOOM = { brand: { _id: ID(1), name: 'Loom & Co.' }, items: [LAWN], subtotal: 7200 }
const MEHR = { brand: { _id: ID(4), name: 'Mehr Menswear' }, items: [KURTA], subtotal: 2500 }
const CART = cartOf(LOOM, MEHR)

const HOME = { _id: ID(5), label: 'Home', fullName: 'Mahnoor Iqbal', phone: '+923001234567', addressLine: 'House 4, Street 2', city: 'Faisalabad', postalCode: '38000', additionalInstructions: 'Blue gate. Ring twice.', latitude: 31.4045, longitude: 73.095, isDefault: true, blocks: [{ _id: D_GROUND._id, name: 'D Ground' }] }
const WORK = { _id: ID(6), label: 'Work', fullName: 'Mahnoor Iqbal', phone: '+923111234567', addressLine: 'Office 2, Main Road', city: 'Faisalabad', latitude: 31.4, longitude: 73.1, isDefault: false, blocks: [{ _id: PEOPLES._id, name: 'Peoples Colony' }] }

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { response: { status, data: { message, ...extra } } })
const ORDER_RESULT = { data: { orders: [{ _id: ID(7), orderNumber: 'CC-1', total: 9700, items: [{}] }] } }

let addresses
let blocksAt
let areaCheck
function serve({ cart = CART } = {}) {
  addresses = []
  blocksAt = { containing: [D_GROUND], nearest: [] }
  areaCheck = { deliverable: [], undeliverable: [] }
  api.get.mockImplementation(async (url) => {
    if (url === '/cart') return { data: { cart } }
    if (url === '/addresses') return { data: { addresses } }
    if (url === '/blocks/at') return { data: blocksAt }
    if (url === '/payments/methods') return { data: { methods: [{ method: 'COD', label: 'Cash on delivery' }] } }
    throw new Error(`unexpected GET ${url}`)
  })
  api.post.mockImplementation(async (url) => {
    if (url === '/cart/area-check') return { data: areaCheck }
    throw new Error(`unexpected POST ${url}`)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRedirects.length = 0
  rememberPlacedOrders([])
  __map.scripts.length = 0
  serve()
})
afterEach(cleanup)

const withPin = (over = {}) => ({ auth: signedIn(), nearby: nearbyValue({ blocks: [D_GROUND, PEOPLES], coords: { lat: 31.4045, lng: 73.095 }, pinned: true, ...over }) })
const noPin = () => ({ auth: signedIn(), nearby: nearbyValue({ blocks: [D_GROUND, PEOPLES] }) })
const pickOnMap = async (lat, lng) => {
  await act(async () => __map.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pick', lat, lng }) } }))
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve() })
}
const fillNew = async (renderer, over = {}) => {
  const values = { Phone: '+92 300 1234567', 'Street address': 'House 41, Street 5', City: 'Faisalabad', 'Delivery notes': 'Blue gate, call on arrival.', ...over }
  for (const [label, value] of Object.entries(values)) await type(renderer, label, value)
}
const placed = () => api.post.mock.calls.find(([url]) => url === '/orders')?.[1]

describe('checkout: a saved address', () => {
  beforeEach(() => {
    addresses = [HOME, WORK]
  })

  it('preselects the default address and fills its standing delivery notes', async () => {
    const renderer = await show(<Checkout />, withPin())
    const text = screenText(renderer)
    expect(text).toContain('Home')
    expect(text).toContain('Default')
    expect(text).toContain('House 4, Street 2, Faisalabad')
    expect(text).toContain('D Ground') // the block holding the saved pin
    expect(text).toContain('Work')
    expect(text).toContain('Deliver to a new address')
    expect(text).not.toContain('Full name') // the form is only for a new address
    const notes = renderer.root.findAll((n) => n.props.accessibilityLabel === 'Delivery notes' && typeof n.props.onChangeText === 'function')[0]
    expect(notes.props.value).toBe('Blue gate. Ring twice.')
  })

  it('places the order with the saved address and its pin, without saving it again', async () => {
    api.post.mockImplementation(async (url) => (url === '/orders' ? ORDER_RESULT : { data: areaCheck }))
    const renderer = await show(<Checkout />, noPin()) // no pin of its own: the saved address brings one
    await press(renderer, 'Place order · Rs 9,700')

    expect(placed()).toEqual({
      paymentMethod: 'COD',
      shippingAddress: { fullName: 'Mahnoor Iqbal', phone: '+923001234567', addressLine: 'House 4, Street 2', city: 'Faisalabad', postalCode: '38000', additionalInstructions: 'Blue gate. Ring twice.' },
      deliveryLocation: { latitude: 31.4045, longitude: 73.095 },
      addressId: HOME._id,
    })
    expect(takePlacedOrders()).toHaveLength(1)
    expect(mockRouter.replace).toHaveBeenCalledWith('/order-placed')
  })

  it('delivers to another saved address, for example the office in another block', async () => {
    api.post.mockImplementation(async (url) => (url === '/orders' ? ORDER_RESULT : { data: areaCheck }))
    const renderer = await show(<Checkout />, noPin())
    await press(renderer, 'Work')
    await press(renderer, 'Place order · Rs 9,700')
    expect(placed()).toMatchObject({ addressId: WORK._id, deliveryLocation: { latitude: 31.4, longitude: 73.1 }, shippingAddress: { addressLine: 'Office 2, Main Road' } })
  })

  it('still needs delivery notes for this order', async () => {
    addresses = [{ ...HOME, additionalInstructions: undefined }]
    const renderer = await show(<Checkout />, noPin())
    await press(renderer, 'Place order · Rs 9,700')
    expect(screenText(renderer)).toContain('Delivery notes are required')
    expect(placed()).toBeUndefined()
  })

  it('shows the new-address form and map when "Deliver to a new address" is chosen', async () => {
    const renderer = await show(<Checkout />, withPin())
    await press(renderer, 'Deliver to a new address')
    const text = screenText(renderer)
    expect(text).toContain('Full name')
    expect(text).toContain('Delivery spot on the map')
    expect(text).toContain('Save this address for next time')
  })
})

describe('checkout: a new address and its pin', () => {
  it('starts from the shopper\'s own pin and says which block it is in', async () => {
    const renderer = await show(<Checkout />, withPin())
    expect(screenText(renderer)).toContain('Delivering to D Ground')
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.4045, lng: 73.095 } })
    const map = lastMapData()
    expect(map).toMatchObject({ pickable: true, pin: { lat: 31.4045, lng: 73.095 } })
    expect(map.zones.map((z) => [z.name, z.selected])).toEqual([['D Ground', true], ['Peoples Colony', false]]) // the holding block is filled in
  })

  it('places the order with the pin, and saves the address under the chosen name', async () => {
    api.post.mockImplementation(async (url) => (url === '/orders' ? ORDER_RESULT : { data: areaCheck }))
    const renderer = await show(<Checkout />, withPin())
    await fillNew(renderer)
    await type(renderer, 'Name this address', 'Parents')
    await press(renderer, 'Place order · Rs 9,700')
    expect(placed()).toMatchObject({ deliveryLocation: { latitude: 31.4045, longitude: 73.095 }, saveAddress: { label: 'Parents' } })
    expect(placed()).not.toHaveProperty('addressId')
  })

  it('does not save the address when the box is unticked', async () => {
    api.post.mockImplementation(async (url) => (url === '/orders' ? ORDER_RESULT : { data: areaCheck }))
    const renderer = await show(<Checkout />, withPin())
    await fillNew(renderer)
    const box = renderer.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function')[0]
    await act(async () => box.props.onPress())
    await press(renderer, 'Place order · Rs 9,700')
    expect(placed()).not.toHaveProperty('saveAddress')
  })

  it('will not place an order without a pin, and tells the shopper to tap the map', async () => {
    const renderer = await show(<Checkout />, noPin())
    await fillNew(renderer)
    expect(screenText(renderer)).toContain('No spot chosen yet.')
    const button = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t).startsWith('Place order')))[0]
    expect(button.props.disabled).toBe(true)
    expect(placed()).toBeUndefined()
  })

  it('takes a pin dropped on the map, checks it, and then lets the order go', async () => {
    api.post.mockImplementation(async (url) => (url === '/orders' ? ORDER_RESULT : { data: areaCheck }))
    const renderer = await show(<Checkout />, noPin())
    await fillNew(renderer)
    await pickOnMap(31.40412345, 73.09512345)

    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.40412, lng: 73.09512 } })
    expect(screenText(renderer)).toContain('Delivering to D Ground')
    await press(renderer, 'Place order · Rs 9,700')
    expect(placed().deliveryLocation).toEqual({ latitude: 31.40412, longitude: 73.09512 })
  })

  it('refuses a pin outside every zone, without sending anything', async () => {
    blocksAt = { containing: [], nearest: [] }
    const renderer = await show(<Checkout />, noPin())
    await fillNew(renderer)
    await pickOnMap(10, 10)
    expect(screenText(renderer)).toContain('We do not deliver there yet. Tap inside a shaded area.')
    await press(renderer, 'Place order · Rs 9,700')
    expect(placed()).toBeUndefined()
  })

  it('names the stores that cannot deliver to the chosen spot', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/orders') {
        throw httpError(409, 'Some items cannot be delivered to this location.', { code: 'CHECKOUT_ISSUES', issues: [{ code: 'NOT_DELIVERABLE', productId: ID(3), brandName: 'Mehr Menswear' }] })
      }
      return { data: areaCheck }
    })
    const renderer = await show(<Checkout />, withPin())
    await fillNew(renderer)
    await press(renderer, 'Place order · Rs 9,700')
    expect(screenText(renderer)).toContain('Mehr Menswear cannot deliver to this spot. Choose another delivery spot, or remove those items from your cart.')
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('explains a server refusal of the spot itself', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/orders') throw httpError(400, 'We do not deliver to this location yet.', { code: 'OUTSIDE_DELIVERY_ZONE' })
      return { data: areaCheck }
    })
    const renderer = await show(<Checkout />, withPin())
    await fillNew(renderer)
    await press(renderer, 'Place order · Rs 9,700')
    expect(screenText(renderer)).toContain('We do not deliver to that spot yet. Tap inside a shaded area on the map.')
  })
})

describe('cart: items a store cannot deliver to the chosen area', () => {
  const area = () => ({ auth: signedIn(), nearby: nearbyValue({ blocks: [D_GROUND], blockIds: [D_GROUND._id], selectedBlocks: [D_GROUND], areaName: 'D Ground' }) })

  it('says nothing when no area is chosen, and never asks the server', async () => {
    const renderer = await show(<CartScreen />, { auth: signedIn(), nearby: nearbyValue() })
    expect(screenText(renderer)).not.toContain('cannot be delivered')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('stays quiet when every store can deliver', async () => {
    areaCheck = { deliverable: [LAWN.productId, KURTA.productId], undeliverable: [] }
    const renderer = await show(<CartScreen />, area())
    expect(api.post).toHaveBeenCalledWith('/cart/area-check', { blockIds: [D_GROUND._id] })
    expect(screenText(renderer)).not.toContain('cannot be delivered')
  })

  it('lists the items that cannot be delivered, and removes them on request', async () => {
    areaCheck = { deliverable: [LAWN.productId], undeliverable: [{ productId: KURTA.productId, name: 'Classic Kurta', brandName: 'Mehr Menswear' }] }
    api.delete.mockImplementation(async () => {
      areaCheck = { deliverable: [LAWN.productId], undeliverable: [] } // the next check finds nothing left to warn about
      return { data: { cart: cartOf(LOOM) } }
    })
    const renderer = await show(<CartScreen />, area())

    const text = screenText(renderer)
    expect(text).toContain('One item cannot be delivered to D Ground')
    expect(text).toContain('Classic Kurta (Mehr Menswear)')
    expect(text).toContain('Remove it')
    expect(text).toContain('Change area')

    await press(renderer, 'Remove it')
    expect(api.delete).toHaveBeenCalledWith(`/cart/items/${KURTA.productId}`)
    const after = screenText(renderer)
    expect(after).not.toContain('Classic Kurta')
    expect(after).toContain('Mehrunisa Printed Lawn')
  })

  it('opens the area chooser from the warning', async () => {
    areaCheck = { deliverable: [], undeliverable: [{ productId: LAWN.productId, name: 'Mehrunisa Printed Lawn', brandName: 'Loom & Co.' }, { productId: KURTA.productId, name: 'Classic Kurta', brandName: 'Mehr Menswear' }] }
    const renderer = await show(<CartScreen />, area())
    expect(screenText(renderer)).toContain('2 items cannot be delivered to D Ground')
    await press(renderer, 'Change area')
    expect(screenText(renderer)).toContain('Where are you shopping?')
  })
})

describe('saved addresses screen', () => {
  beforeEach(() => {
    addresses = [HOME, WORK]
  })

  it('lists the addresses with their blocks and which one is the default', async () => {
    const text = screenText(await show(<Addresses />, { auth: signedIn() }))
    expect(text).toContain('Saved addresses')
    expect(text).toContain('Home')
    expect(text).toContain('Default')
    expect(text).toContain('D Ground')
    expect(text).toContain('Peoples Colony')
    expect(text).toContain('Office 2, Main Road, Faisalabad')
  })

  it('warns when a saved spot is no longer in a delivery zone', async () => {
    addresses = [{ ...WORK, blocks: [] }]
    expect(screenText(await show(<Addresses />, { auth: signedIn() }))).toContain('We no longer deliver to this spot.')
  })

  it('makes an address the default, and reloads the list', async () => {
    api.post.mockResolvedValue({ data: { address: { ...WORK, isDefault: true } } })
    const renderer = await show(<Addresses />, { auth: signedIn() })
    await press(renderer, 'Make default')
    expect(api.post).toHaveBeenCalledWith(`/addresses/${WORK._id}/default`)
    expect(api.get.mock.calls.filter(([url]) => url === '/addresses').length).toBeGreaterThanOrEqual(2)
  })

  it('asks before deleting, and deletes only when confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    api.delete.mockResolvedValue({ data: {} })
    const renderer = await show(<Addresses />, { auth: signedIn() })
    const deleteButtons = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t) === 'Delete'))
    await act(async () => deleteButtons.at(-1).props.onPress()) // the last card: Work
    expect(alert).toHaveBeenCalledWith('Delete “Work”?', expect.any(String), expect.any(Array))
    expect(api.delete).not.toHaveBeenCalled()

    const confirm = alert.mock.calls[0][2].find((b) => b.text === 'Delete')
    await act(async () => confirm.onPress())
    expect(api.delete).toHaveBeenCalledWith(`/addresses/${WORK._id}`)
    alert.mockRestore()
  })

  it('invites the shopper to save one at checkout when there are none', async () => {
    addresses = []
    expect(screenText(await show(<Addresses />, { auth: signedIn() }))).toContain('No saved addresses yet')
  })

  it('asks a visitor to sign in', async () => {
    const { signedOut } = require('./helpers/screens')
    expect(screenText(await show(<Addresses />, { auth: signedOut() }))).toContain('Sign in to see your addresses')
  })
})
