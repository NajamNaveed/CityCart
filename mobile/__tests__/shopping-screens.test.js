/**
 * The shopping flow, screen by screen, against a fake server: cart, add to cart,
 * checkout, order confirmation, orders list and order detail.
 */
import React from 'react'
import { Alert, Text } from 'react-native'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
const mockRedirects = []
let mockParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
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
jest.mock('../src/components/NearbyMap', () => {
  const React = require('react')
  const { View } = require('react-native')
  // Keep the props so a test can read the pin and the rider the map was given.
  return function MockNearbyMap(props) {
    return <View testID="map" {...props} />
  }
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
import { rememberPlacedOrders, takePlacedOrders } from '../src/services/orders'
import CartScreen from '../src/app/(tabs)/cart'
import Checkout from '../src/app/checkout'
import OrderPlaced from '../src/app/order-placed'
import Orders from '../src/app/orders/index'
import OrderScreen from '../src/app/orders/[id]'
import ProductScreen from '../src/app/product/[id]'
import { CUSTOMER, cleanup, nearbyValue, press, pressByLabel, pullToRefresh, screenText, show, signedIn, signedOut, textOf, tick, type } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const LAWN = { productId: ID(2), name: 'Mehrunisa Printed Lawn', image: '', unitPrice: 3600, quantity: 2, lineTotal: 7200 }
const KURTA = { productId: ID(3), name: 'Classic Kurta', image: '', unitPrice: 2500, quantity: 1, lineTotal: 2500 }
const cartOf = (...groups) => ({ groups, itemCount: groups.flatMap((g) => g.items).reduce((n, i) => n + i.quantity, 0), subtotal: groups.reduce((n, g) => n + g.subtotal, 0) })
const LOOM = { brand: { _id: ID(1), name: 'Loom & Co.' }, items: [LAWN], subtotal: 7200 }
const MEHR = { brand: { _id: ID(4), name: 'Mehr Menswear' }, items: [KURTA], subtotal: 2500 }
const CART = cartOf(LOOM, MEHR)

const ORDER_ITEM = { _id: ID(7), productId: ID(2), productName: 'Mehrunisa Printed Lawn', image: '', quantity: 2, unitPrice: 3600, totalPrice: 7200 }
const ORDER = {
  _id: ID(5),
  orderNumber: 'CC-20261004-0007',
  brandName: 'Loom & Co.',
  orderStatus: 'PENDING',
  createdAt: '2026-10-04T10:00:00Z',
  statusHistory: [{ status: 'PENDING', at: '2026-10-04T10:00:00Z' }],
  items: [ORDER_ITEM],
  subtotal: 7200,
  deliveryFee: 0,
  total: 7200,
  shippingAddress: { name: 'Sana Iqbal', address: 'House 41, Street 5', city: 'Faisalabad', state: 'Punjab', postalCode: '38000', phone: '+92 300 1234567', additionalInstructions: 'Blue gate' },
}

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { response: { status, data: { message, ...extra } } })

const BLOCK = { _id: ID(9), name: 'Gulberg' }
const POSITION = { lat: 31.4, lng: 73.1 }
// A shopper with an area chosen, so checkout has a delivery spot to send.
const nearby = () => nearbyValue({ blockIds: [BLOCK._id], selectedBlocks: [BLOCK], areaName: BLOCK.name, coords: POSITION, origin: POSITION })

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockRedirects.length = 0
  mockParams = {}
  rememberPlacedOrders([])
  api.get.mockImplementation(async (url) => {
    if (url === '/cart') return { data: { cart: CART } }
    if (url === '/addresses') return { data: { addresses: [] } }
    if (url === '/blocks/at') return { data: { containing: [BLOCK], nearest: [] } }
    throw new Error(`unexpected GET ${url}`)
  })
  api.post.mockResolvedValue({ data: { deliverable: [], undeliverable: [] } })
})

const auth = () => ({ auth: signedIn(), nearby: nearby() })

describe('Cart', () => {
  it('asks a signed-out visitor to sign in, and brings them back', async () => {
    const renderer = await show(<CartScreen />, { auth: signedOut() })
    expect(screenText(renderer)).toContain('Sign in to see your cart')
    expect(api.get).not.toHaveBeenCalled()
    await press(renderer, 'Sign in')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/cart' } })
    await press(renderer, 'Create an account')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/register', params: { next: '/cart' } })
  })

  it('lists every brand\'s items with prices, subtotals and the total', async () => {
    const text = screenText(await show(<CartScreen />, auth()))
    expect(text).toContain('3 items')
    for (const expected of ['Loom & Co.', 'Mehr Menswear', 'Mehrunisa Printed Lawn', 'Classic Kurta', 'Rs 3,600 each', 'Rs 7,200', 'Rs 2,500', 'Rs 9,700']) expect(text).toContain(expected)
    expect(text).toContain('cash on delivery')
    expect(text).toContain('Checkout')
  })

  it('goes to checkout', async () => {
    const renderer = await show(<CartScreen />, auth())
    await press(renderer, 'Checkout')
    expect(mockRouter.push).toHaveBeenCalledWith('/checkout')
  })

  it('changes a quantity on the server and shows the cart it sends back', async () => {
    const updated = cartOf({ ...LOOM, items: [{ ...LAWN, quantity: 3, lineTotal: 10800 }], subtotal: 10800 }, MEHR)
    api.patch.mockResolvedValue({ data: { cart: updated } })
    const cart = { itemCount: 3, addItem: jest.fn(), setCount: jest.fn() }
    const renderer = await show(<CartScreen />, { auth: signedIn(), cart })

    await pressByLabel(renderer, 'Increase Mehrunisa Printed Lawn')

    expect(api.patch).toHaveBeenCalledWith(`/cart/items/${ID(2)}`, { quantity: 3 })
    expect(screenText(renderer)).toContain('Rs 10,800')
    expect(screenText(renderer)).toContain('Rs 13,300') // the new total
    expect(cart.setCount).toHaveBeenLastCalledWith(4)
  })

  it('removes an item', async () => {
    api.delete.mockResolvedValue({ data: { cart: cartOf(MEHR) } })
    const renderer = await show(<CartScreen />, auth())
    await pressByLabel(renderer, 'Remove Mehrunisa Printed Lawn')
    expect(api.delete).toHaveBeenCalledWith(`/cart/items/${ID(2)}`)
    const text = screenText(renderer)
    expect(text).not.toContain('Mehrunisa Printed Lawn')
    expect(text).toContain('Classic Kurta')
  })

  it('keeps the cart and says why when a change is refused', async () => {
    api.patch.mockRejectedValue(httpError(409, 'Only 2 available'))
    const renderer = await show(<CartScreen />, auth())
    await pressByLabel(renderer, 'Increase Mehrunisa Printed Lawn')
    const text = screenText(renderer)
    expect(text).toContain('Only 2 available')
    expect(text).toContain('Rs 7,200') // unchanged
  })

  it('blocks checkout while an item cannot be ordered', async () => {
    const broken = cartOf({ ...LOOM, items: [{ ...LAWN, issue: 'OUT_OF_STOCK' }] })
    api.get.mockResolvedValue({ data: { cart: broken } })
    const text = screenText(await show(<CartScreen />, auth()))
    expect(text).toContain('Out of stock')
    expect(text).toContain('Remove or fix the items marked above')
    expect(text).not.toContain('Checkout')
  })

  it('warns when the shops in the cart cannot deliver to the chosen area, and removes those items', async () => {
    let checks = 0
    api.post.mockImplementation(async (url) => {
      if (url === '/cart/area-check') {
        checks += 1
        // Once the item is removed, the fresh check has nothing to complain about.
        return {
          data: {
            deliverable: [KURTA.productId],
            undeliverable: checks === 1 ? [{ productId: LAWN.productId, name: LAWN.name, brandName: 'Loom & Co.' }] : [],
          },
        }
      }
      throw new Error(`unexpected POST ${url}`)
    })
    api.delete.mockResolvedValue({ data: { cart: cartOf(MEHR) } })
    const near = nearby()
    const renderer = await show(<CartScreen />, { auth: signedIn(), nearby: near })

    expect(api.post).toHaveBeenCalledWith('/cart/area-check', { blockIds: [BLOCK._id] })
    const text = screenText(renderer)
    expect(text).toContain('One item cannot be delivered to Gulberg')
    expect(text).toContain('Mehrunisa Printed Lawn (Loom & Co.)')

    await press(renderer, 'Remove it')
    expect(api.delete).toHaveBeenCalledWith(`/cart/items/${LAWN.productId}`)
    expect(screenText(renderer)).not.toContain('Mehrunisa Printed Lawn')
  })

  it('offers to change the area instead', async () => {
    api.post.mockImplementation(async (url) => {
      if (url === '/cart/area-check') return { data: { deliverable: [], undeliverable: [{ productId: LAWN.productId, name: LAWN.name, brandName: 'Loom & Co.' }] } }
      throw new Error(`unexpected POST ${url}`)
    })
    const near = nearby()
    const renderer = await show(<CartScreen />, { auth: signedIn(), nearby: near })
    await press(renderer, 'Change area')
    expect(mockRouter.navigate).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/nearby', params: expect.objectContaining({ view: 'map' }) }))
  })

  it('invites the shopper to start shopping when the cart is empty', async () => {
    api.get.mockResolvedValue({ data: { cart: { groups: [], itemCount: 0, subtotal: 0 } } })
    const renderer = await show(<CartScreen />, auth())
    expect(screenText(renderer)).toContain('Your cart is empty')
    await press(renderer, 'Start shopping')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/nearby')
  })

  it('offers to try again when the cart cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('Cannot reach the server. Check your connection.'))
    const text = screenText(await show(<CartScreen />, auth()))
    expect(text).toContain("Couldn't load your cart")
    expect(text).toContain('Try again')
  })
})

describe('Add to cart (product page)', () => {
  const PRODUCT = { _id: ID(2), brandId: ID(1), name: 'Mehrunisa Printed Lawn', price: 3600, images: [], availability: 'IN_STOCK', attributes: {} }
  beforeEach(() => {
    mockParams = { id: PRODUCT._id }
    api.get.mockImplementation(async (url) => {
      if (url === `/products/${PRODUCT._id}`) return { data: { product: PRODUCT } }
      if (url === `/brands/${PRODUCT.brandId}`) return { data: { brand: { _id: ID(1), name: 'Loom & Co.' } } }
      if (url === `/products/${PRODUCT._id}/reviews`) return { data: { reviews: [], summary: { average: 0, count: 0, distribution: {} }, pagination: { page: 1, pages: 0, total: 0 } } }
      throw new Error(`unexpected GET ${url}`)
    })
  })

  it('sends a visitor to sign in, and remembers how many they chose', async () => {
    const renderer = await show(<ProductScreen />, { auth: signedOut() })
    expect(screenText(renderer)).toContain('Sign in to add to cart')
    await pressByLabel(renderer, 'Increase Mehrunisa Printed Lawn')
    await pressByLabel(renderer, 'Increase Mehrunisa Printed Lawn')
    await press(renderer, 'Sign in to add to cart')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: `/product/${PRODUCT._id}?add=3` } })
  })

  it('adds the chosen quantity for a signed-in shopper and offers the cart', async () => {
    const cart = { itemCount: 0, addItem: jest.fn().mockResolvedValue({ itemCount: 2 }), setCount: jest.fn() }
    const renderer = await show(<ProductScreen />, { auth: signedIn(), cart })
    await pressByLabel(renderer, 'Increase Mehrunisa Printed Lawn')
    await press(renderer, 'Add to cart')
    expect(cart.addItem).toHaveBeenCalledWith(PRODUCT._id, 2)
    const text = screenText(renderer)
    expect(text).toContain('Added 2 to your cart.')
    await press(renderer, 'View cart')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/cart')
  })

  it('says why when it cannot be added', async () => {
    const cart = { itemCount: 0, addItem: jest.fn().mockRejectedValue(httpError(409, 'Only 1 left in stock')), setCount: jest.fn() }
    const renderer = await show(<ProductScreen />, { auth: signedIn(), cart })
    await press(renderer, 'Add to cart')
    expect(screenText(renderer)).toContain('Only 1 left in stock')
  })

  it('cannot add a sold-out product', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === `/products/${PRODUCT._id}`) return { data: { product: { ...PRODUCT, availability: 'OUT_OF_STOCK' } } }
      if (url.endsWith('/reviews')) return { data: { reviews: [], summary: { average: 0, count: 0, distribution: {} }, pagination: { page: 1, pages: 0, total: 0 } } }
      return { data: { brand: { _id: ID(1), name: 'Loom & Co.' } } }
    })
    const cart = { itemCount: 0, addItem: jest.fn(), setCount: jest.fn() }
    const renderer = await show(<ProductScreen />, { auth: signedIn(), cart })
    expect(screenText(renderer)).toContain('Sold out')
    const button = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityState?.disabled === true)
    expect(button.length).toBeGreaterThan(0)
    expect(cart.addItem).not.toHaveBeenCalled()
  })

  it('finishes an add that was waiting for sign-in, once', async () => {
    mockParams = { id: PRODUCT._id, add: '2' }
    const cart = { itemCount: 0, addItem: jest.fn().mockResolvedValue({ itemCount: 2 }), setCount: jest.fn() }
    jest.useFakeTimers()
    const renderer = await show(<ProductScreen />, { auth: signedIn(), cart })
    await act(async () => { jest.advanceTimersByTime(50) })
    await tick()
    jest.useRealTimers()
    expect(cart.addItem).toHaveBeenCalledTimes(1)
    expect(cart.addItem).toHaveBeenCalledWith(PRODUCT._id, 2)
    expect(mockRouter.setParams).toHaveBeenCalledWith({ add: '' })
    expect(screenText(renderer)).toContain('Added 2 to your cart.')
  })
})

describe('Checkout', () => {
  const fill = async (renderer, overrides = {}) => {
    const values = { Phone: '+92 300 1234567', 'Street address': 'House 41, Street 5', City: 'Faisalabad', 'Delivery notes': 'Blue gate, call on arrival.', ...overrides }
    for (const [label, value] of Object.entries(values)) await type(renderer, label, value)
  }

  it('asks a visitor to sign in first', async () => {
    expect(screenText(await show(<Checkout />, { auth: signedOut() }))).toContain('Sign in to check out')
  })

  it('goes back to the cart when there is nothing to buy', async () => {
    api.get.mockResolvedValue({ data: { cart: { groups: [], itemCount: 0, subtotal: 0 } } })
    await show(<Checkout />, auth())
    expect(mockRedirects).toContain('/cart')
  })

  it('shows the address form, cash on delivery and the order summary', async () => {
    const text = screenText(await show(<Checkout />, auth()))
    for (const expected of ['Delivery address', 'Full name', 'Cash on delivery', '2 × Mehrunisa Printed Lawn', '1 × Classic Kurta', 'Total to pay', 'Rs 9,700', 'becomes 2 separate orders', 'Place order · Rs 9,700']) expect(text).toContain(expected)
  })

  it('delivers to a saved address without asking for the map pin again', async () => {
    const ADDRESS = {
      _id: ID(8),
      label: 'Home',
      isDefault: true,
      fullName: 'Sana Iqbal',
      phone: '+92 300 1234567',
      addressLine: 'House 41, Street 5',
      city: 'Faisalabad',
      postalCode: '',
      additionalInstructions: 'Blue gate',
      latitude: 31.41,
      longitude: 73.08,
      blocks: [BLOCK],
    }
    api.get.mockImplementation(async (url) => {
      if (url === '/cart') return { data: { cart: CART } }
      if (url === '/addresses') return { data: { addresses: [ADDRESS] } }
      throw new Error(`unexpected GET ${url}`)
    })
    api.post.mockResolvedValue({ data: { orders: [{ _id: ID(5), orderNumber: 'CC-1', total: 9700, items: [{}] }] } })
    const renderer = await show(<Checkout />, auth())

    const text = screenText(renderer)
    expect(text).toContain('Home')
    expect(text).toContain('Default')
    expect(text).toContain('Delivering to Gulberg')
    expect(text).not.toContain('Full name') // the saved address replaces the form
    expect(renderer.root.findAll((n) => n.props.accessibilityLabel === 'Delivery notes')[0].props.value).toBe('Blue gate')

    await press(renderer, 'Place order · Rs 9,700')
    expect(api.post).toHaveBeenCalledWith('/orders', {
      paymentMethod: 'COD',
      shippingAddress: { fullName: 'Sana Iqbal', phone: '+92 300 1234567', addressLine: 'House 41, Street 5', city: 'Faisalabad', additionalInstructions: 'Blue gate' },
      deliveryLocation: { latitude: 31.41, longitude: 73.08 },
      addressId: ADDRESS._id,
    })
  })

  it('will not send an order to a pin outside the delivery areas', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cart') return { data: { cart: CART } }
      if (url === '/addresses') return { data: { addresses: [] } }
      if (url === '/blocks/at') return { data: { containing: [], nearest: [{ _id: BLOCK._id, distanceKm: 0.4 }] } }
      throw new Error(`unexpected GET ${url}`)
    })
    const renderer = await show(<Checkout />, auth())
    await fill(renderer)
    await press(renderer, 'Place order · Rs 9,700')
    expect(screenText(renderer)).toContain('We do not deliver to that spot yet')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('names the stores that cannot reach the delivery spot', async () => {
    api.post.mockRejectedValue(httpError(409, 'Some items cannot be delivered to this location.', { code: 'CHECKOUT_ISSUES', issues: [{ code: 'NOT_DELIVERABLE', brandName: 'Loom & Co.' }] }))
    const renderer = await show(<Checkout />, auth())
    await fill(renderer)
    await press(renderer, 'Place order · Rs 9,700')
    expect(screenText(renderer)).toContain('Loom & Co. cannot deliver to this spot')
  })

  it('explains what is missing and sends nothing', async () => {
    const renderer = await show(<Checkout />, auth())
    await press(renderer, 'Place order · Rs 9,700')
    const text = screenText(renderer)
    expect(text).toContain('Delivery notes are required')
    expect(text).toContain('Enter a valid phone number')
    expect(text).toContain('Enter your street address.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('places the order, clears the badge, remembers the orders and shows the confirmation', async () => {
    const created = [{ _id: ID(5), orderNumber: 'CC-1', total: 7200, items: [{}] }, { _id: ID(6), orderNumber: 'CC-2', total: 2500, items: [{}] }]
    api.post.mockResolvedValue({ data: { orders: created } })
    const cart = { itemCount: 3, addItem: jest.fn(), setCount: jest.fn() }
    const renderer = await show(<Checkout />, { auth: signedIn(), cart, nearby: nearby() })

    await fill(renderer)
    await press(renderer, 'Place order · Rs 9,700')

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/orders', {
      paymentMethod: 'COD',
      shippingAddress: { fullName: 'Sana Iqbal', phone: '+92 300 1234567', addressLine: 'House 41, Street 5', city: 'Faisalabad', additionalInstructions: 'Blue gate, call on arrival.' },
      deliveryLocation: { latitude: POSITION.lat, longitude: POSITION.lng },
      saveAddress: { label: 'Home' },
    })
    expect(cart.setCount).toHaveBeenCalledWith(0)
    expect(takePlacedOrders()).toEqual(created)
    expect(mockRouter.replace).toHaveBeenCalledWith('/order-placed')
  })

  it('places an order only once, however fast the button is tapped', async () => {
    let finish
    api.post.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const renderer = await show(<Checkout />, auth())
    await fill(renderer)
    const placeButton = () => renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t).startsWith('Place order')))[0]
    // three taps in the same instant: only one order may be placed
    await act(async () => {
      const button = placeButton()
      button.props.onPress()
      button.props.onPress()
      button.props.onPress()
    })
    expect(api.post).toHaveBeenCalledTimes(1)
    await act(async () => finish({ data: { orders: [{ _id: ID(5), orderNumber: 'CC-1', total: 1, items: [] }] } }))
  })

  it('shows the server\'s complaint under the right field, and lets the shopper retry', async () => {
    api.post.mockRejectedValue(httpError(400, 'Validation failed.', { errors: [{ field: 'shippingAddress.phone', message: 'invalid phone number' }] }))
    const renderer = await show(<Checkout />, auth())
    await fill(renderer)
    await press(renderer, 'Place order · Rs 9,700')
    const text = screenText(renderer)
    expect(text).toContain('Validation failed.')
    expect(text).toContain('Invalid phone number.')
    expect(mockRouter.replace).not.toHaveBeenCalled()

    api.post.mockResolvedValue({ data: { orders: [{ _id: ID(5), orderNumber: 'CC-1', total: 1, items: [] }] } })
    await press(renderer, 'Place order · Rs 9,700')
    expect(api.post).toHaveBeenCalledTimes(2) // not stuck in "placing"
  })

  it('does not offer to place the order while an item is unavailable', async () => {
    api.get.mockResolvedValue({ data: { cart: cartOf({ ...LOOM, items: [{ ...LAWN, issue: 'PRODUCT_UNAVAILABLE' }] }) } })
    const text = screenText(await show(<Checkout />, auth()))
    expect(text).toContain('Some items need attention')
    expect(text).not.toContain('Place order')
  })
})

describe('Order placed', () => {
  it('goes to the orders list when nothing was just placed', async () => {
    await show(<OrderPlaced />, auth())
    expect(mockRedirects).toContain('/orders')
  })

  it('confirms the order, the amount to pay in cash, and links to tracking', async () => {
    rememberPlacedOrders([{ _id: ID(5), orderNumber: 'CC-1', total: 7200, items: [{}, {}] }])
    const renderer = await show(<OrderPlaced />, auth())
    const text = screenText(renderer)
    expect(text).toContain('Order placed!')
    expect(text).toContain('CC-1')
    expect(text).toContain('2 items · Rs 7,200')
    expect(text).toContain('Pay Rs 7,200 in cash')
    await press(renderer, 'View my orders')
    expect(mockRouter.replace).toHaveBeenCalledWith('/orders')
  })

  it('explains a split order', async () => {
    rememberPlacedOrders([{ _id: ID(5), orderNumber: 'CC-1', total: 7200, items: [{}] }, { _id: ID(6), orderNumber: 'CC-2', total: 2500, items: [{}] }])
    const text = screenText(await show(<OrderPlaced />, auth()))
    expect(text).toContain('so we created 2 orders')
    expect(text).toContain('Pay Rs 9,700 in cash')
  })
})

describe('Orders list', () => {
  it('lists orders with brand, date, status and total, and opens one', async () => {
    api.get.mockResolvedValue({ data: { orders: [ORDER], pagination: { page: 1, pages: 1, total: 1 } } })
    const renderer = await show(<Orders />, auth())
    const text = screenText(renderer)
    for (const expected of ['My orders', 'CC-20261004-0007', 'Pending', 'Loom & Co.', '1 item', 'Rs 7,200']) expect(text).toContain(expected)
    expect(api.get).toHaveBeenCalledWith('/orders/my', { params: { page: 1, limit: 10 } })
    await press(renderer, 'CC-20261004-0007')
    expect(mockRouter.push).toHaveBeenCalledWith(`/orders/${ORDER._id}`)
  })

  it('invites the shopper to shop when there are none, and asks visitors to sign in', async () => {
    api.get.mockResolvedValue({ data: { orders: [], pagination: { page: 1, pages: 0, total: 0 } } })
    expect(screenText(await show(<Orders />, auth()))).toContain('No orders yet')
    expect(screenText(await show(<Orders />, { auth: signedOut() }))).toContain('Sign in to see your orders')
  })

  it('says when a refresh failed, and keeps the orders on screen', async () => {
    api.get.mockResolvedValue({ data: { orders: [ORDER], pagination: { page: 1, pages: 1, total: 1 } } })
    const renderer = await show(<Orders />, auth())
    api.get.mockRejectedValueOnce(Object.assign(new Error('Server error'), { response: { status: 500, data: { message: 'Server error' } } }))
    await pullToRefresh(renderer)

    const text = screenText(renderer)
    expect(text).toContain("Couldn't refresh. Server error")
    expect(text).toContain('CC-20261004-0007')
  })
})

describe('Order detail', () => {
  const serve = (order = ORDER, extra = {}) => {
    mockParams = { id: order._id }
    api.get.mockImplementation(async (url) => {
      if (url === `/orders/${order._id}`) return { data: { order, payment: { status: 'PENDING' }, delivery: null, ...extra } }
      throw new Error(`unexpected GET ${url}`)
    })
  }

  it('shows the order, its progress, items, totals and address', async () => {
    serve()
    const text = screenText(await show(<OrderScreen />, auth()))
    for (const expected of ['CC-20261004-0007', 'Pending', 'Payment pending', 'Placed', 'Confirmed', 'Out for delivery', 'Delivered', 'Mehrunisa Printed Lawn', '2 × Rs 3,600', 'Rs 7,200', 'Pay in cash when your order arrives', 'Sana Iqbal', 'House 41, Street 5', 'Faisalabad, Punjab, 38000', 'Notes: Blue gate', 'Cancel order']) {
      expect(text).toContain(expected)
    }
  })

  describe('what arrived and what came back', () => {
    const delivered = { ...ORDER, orderStatus: 'DELIVERED', statusHistory: [{ status: 'PENDING' }, { status: 'DELIVERED' }] }
    const returnOf = (line, extra = {}) => ({ lines: [line], ...extra })

    it('shows a half-and-half order line by line, with the final total', async () => {
      const order = { ...delivered, fulfilment: 'PARTIAL', returnedAmount: 1800, feeRefunded: false, netTotal: 5400 }
      serve(order, {
        payment: { status: 'PAID' },
        return: returnOf({ orderItemId: ORDER_ITEM._id, productName: ORDER_ITEM.productName, quantity: 1, unitPrice: 3600, reason: 'DAMAGED' }, { returnedSubtotal: 1800, refundAmount: 0 }),
      })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).toContain('What arrived')
      expect(text).toContain('Part of your order came back.')
      expect(text).toContain('1 delivered · 1 returned — Damaged')
      expect(text).toContain('Goods returned')
      expect(text).toContain('− Rs 1,800')
      expect(text).toContain('Final total')
      expect(text).toContain('Rs 5,400')
    })

    it('shows a fully returned order, the refund and the refunded delivery fee', async () => {
      const order = { ...delivered, paymentMethod: 'COD', orderStatus: 'RETURNED', fulfilment: 'NONE', returnedAmount: 7200, feeRefunded: true, netTotal: 0, deliveryFee: 250, total: 7450 }
      serve(order, {
        payment: { status: 'REFUNDED' },
        return: returnOf({ orderItemId: ORDER_ITEM._id, productName: ORDER_ITEM.productName, quantity: 2, unitPrice: 3600, reason: 'DAMAGED' }, { returnedSubtotal: 7200, refundAmount: 7450 }),
      })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).toContain('Your whole order went back to the store.')
      expect(text).toContain('All 2 returned — Damaged')
      expect(text).toContain('Delivery fee refunded')
      expect(text).toContain('Refunded to you')
      expect(text).toContain('Rs 7,450')
      expect(text).toContain('Final total')
      expect(text).toContain('Rs 0')
    })

    it('says everything arrived when nothing came back', async () => {
      serve({ ...delivered, fulfilment: 'FULL', returnedAmount: 0, netTotal: 7200 }, { payment: { status: 'PAID' } })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).toContain('Everything arrived.')
      expect(text).toContain('2 delivered')
      expect(text).toContain('Final total')
      expect(text).not.toContain('Goods returned')
    })
  })

  it('shows courier tracking once it exists', async () => {
    serve({ ...ORDER, orderStatus: 'SHIPPED', statusHistory: [{ status: 'PENDING' }, { status: 'CONFIRMED' }, { status: 'SHIPPED' }] }, { delivery: { status: 'IN_TRANSIT', trackingReference: 'TCS-998877', assignedAgent: 'TCS Faisalabad' } })
    const text = screenText(await show(<OrderScreen />, auth()))
    expect(text).toContain('Delivery tracking')
    expect(text).toContain('TCS-998877')
    expect(text).toContain('TCS Faisalabad')
    expect(text).not.toContain('Cancel order') // too late to cancel
  })

  describe('the delivery code and the receipt', () => {
    const ON_THE_ROAD = { ...ORDER, orderStatus: 'OUT_FOR_DELIVERY', statusHistory: [{ status: 'PENDING' }, { status: 'CONFIRMED' }, { status: 'SHIPPED' }, { status: 'OUT_FOR_DELIVERY' }] }
    const serveWith = (order, { payment = { status: 'PENDING' }, delivery = null, code, receipt } = {}) => {
      mockParams = { id: order._id }
      api.get.mockImplementation(async (url) => {
        if (url === `/orders/${order._id}`) return { data: { order, payment, delivery } }
        if (delivery && url === `/deliveries/${delivery._id}/code`) {
          if (code instanceof Error) throw code
          return { data: { code } }
        }
        if (url === `/receipts/order/${order._id}`) {
          if (receipt instanceof Error || !receipt) throw receipt || new Error('no receipt')
          return { data: { receipt } }
        }
        throw new Error(`unexpected GET ${url}`)
      })
    }

    it('shows the six-digit code while the order is on its way, so the customer can read it to the rider', async () => {
      serveWith(ON_THE_ROAD, { delivery: { _id: ID(9), status: 'OUT_FOR_DELIVERY', assignedAgent: 'Bilal Ahmed' }, code: '482913' })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).toContain('Your delivery code')
      expect(text).toContain('482913')
      expect(text).toContain('Give this code to the rider')
      expect(api.get).toHaveBeenCalledWith(`/deliveries/${ID(9)}/code`)
    })

    it('does not ask for a code before the order is on the road, or once it is delivered', async () => {
      for (const status of ['READY_FOR_PICKUP', 'DELIVERED']) {
        api.get.mockReset()
        serveWith(ON_THE_ROAD, { delivery: { _id: ID(9), status }, code: '482913' })
        const text = screenText(await show(<OrderScreen />, auth()))
        expect(text).not.toContain('Your delivery code')
        expect(api.get).not.toHaveBeenCalledWith(`/deliveries/${ID(9)}/code`)
      }
    })

    it('shows nothing, and no error, when the server has no code to give', async () => {
      const refused = Object.assign(new Error('http'), { response: { status: 409, data: { code: 'CODE_NOT_AVAILABLE' } } })
      serveWith(ON_THE_ROAD, { delivery: { _id: ID(9), status: 'OUT_FOR_DELIVERY' }, code: refused })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).not.toContain('Your delivery code')
      expect(text).toContain('CC-20261004-0007') // the rest of the page is fine
    })

    it('shows the receipt number once a paid order has one', async () => {
      const delivered = { ...ORDER, orderStatus: 'DELIVERED' }
      serveWith(delivered, { payment: { status: 'PAID' }, delivery: { _id: ID(9), status: 'DELIVERED' }, receipt: { receiptNumber: 'RC-2026-000012', issuedAt: '2026-10-20T10:00:00Z' } })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).toContain('Paid in cash on delivery')
      expect(text).toContain('Receipt RC-2026-000012')
    })

    it('says how a payment at the door was made', async () => {
      const delivered = { ...ORDER, orderStatus: 'DELIVERED' }
      serveWith(delivered, {
        payment: { status: 'PAID' },
        delivery: { _id: ID(9), status: 'DELIVERED' },
        receipt: { receiptNumber: 'RC-2026-000012', issuedAt: '2026-10-20T10:00:00Z', collectionMethod: 'WALLET', collectionWallet: 'JAZZCASH' },
      })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).toContain('paid by wallet (JazzCash)')
    })

    it('does not look for a receipt on an unpaid order', async () => {
      serveWith(ORDER, { payment: { status: 'PENDING' }, receipt: { receiptNumber: 'RC-1', issuedAt: '2026-10-20T10:00:00Z' } })
      const text = screenText(await show(<OrderScreen />, auth()))
      expect(text).not.toContain('Receipt RC-')
      expect(api.get).not.toHaveBeenCalledWith(`/receipts/order/${ORDER._id}`)
    })
  })

  it('cancels a pending order after asking, and shows the result', async () => {
    serve()
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    api.patch.mockResolvedValue({ data: { order: { ...ORDER, orderStatus: 'CANCELLED' } } })
    const renderer = await show(<OrderScreen />, auth())

    await press(renderer, 'Cancel order')
    expect(Alert.alert).toHaveBeenCalledTimes(1)
    expect(api.patch).not.toHaveBeenCalled() // nothing happens until the shopper confirms
    const buttons = Alert.alert.mock.calls[0][2]
    expect(buttons.map((b) => b.text)).toEqual(['Keep my order', 'Yes, cancel it'])
    await act(async () => buttons[1].onPress())
    await tick()

    expect(api.patch).toHaveBeenCalledWith(`/orders/${ORDER._id}/cancel`)
    const text = screenText(renderer)
    expect(text).toContain('Your order has been cancelled.')
    expect(text).toContain('This order was cancelled.')
    expect(text).not.toContain('Cancel order')
  })

  it('shows why an order was cancelled or rejected, instead of a progress bar', async () => {
    serve({ ...ORDER, orderStatus: 'REJECTED', rejectionReason: 'Out of fabric' })
    const text = screenText(await show(<OrderScreen />, auth()))
    expect(text).toContain('The brand could not fulfil this order')
    expect(text).toContain('Reason: Out of fabric')
    expect(text).not.toContain('Out for delivery')
  })

  it('says not found for a bad or someone else\'s order, without a pointless request for a bad id', async () => {
    mockParams = { id: 'nope' }
    expect(screenText(await show(<OrderScreen />, auth()))).toContain('Order not found')
    expect(api.get).not.toHaveBeenCalled()

    mockParams = { id: ID(8) }
    api.get.mockRejectedValue(httpError(404, 'Order not found'))
    expect(screenText(await show(<OrderScreen />, auth()))).toContain('Order not found')
  })

  it('asks a visitor to sign in, and returns to this order afterwards', async () => {
    mockParams = { id: ORDER._id }
    const renderer = await show(<OrderScreen />, { auth: signedOut() })
    expect(screenText(renderer)).toContain('Sign in to see this order')
    await press(renderer, 'Sign in')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: `/orders/${ORDER._id}` } })
    expect(api.get).not.toHaveBeenCalled()
    expect(CUSTOMER.role).toBe('CUSTOMER')
  })
})

describe('paying at the door', () => {
  const fill = async (renderer) => {
    const values = { Phone: '+92 300 1234567', 'Street address': 'House 41, Street 5', City: 'Faisalabad', 'Delivery notes': 'Blue gate, call on arrival.' }
    for (const [label, value] of Object.entries(values)) await type(renderer, label, value)
  }
  const serveCheckout = () =>
    api.get.mockImplementation(async (url) => {
      if (url === '/cart') return { data: { cart: CART } }
      if (url === '/addresses') return { data: { addresses: [] } }
      if (url === '/blocks/at') return { data: { containing: [BLOCK], nearest: [] } }
      throw new Error(`unexpected GET ${url}`)
    })

  it('offers cash on delivery only', async () => {
    serveCheckout()
    const text = screenText(await show(<Checkout />, auth()))
    expect(text).toContain('Cash on delivery')
    expect(text).not.toContain('Online payment')
  })

  it('places the order with cash on delivery and confirms it was placed', async () => {
    serveCheckout()
    api.post.mockResolvedValue({ data: { orders: [{ _id: ID(5), orderNumber: 'CC-1', total: 7200, items: [{}] }] } })
    const renderer = await show(<Checkout />, auth())
    await fill(renderer)
    await press(renderer, 'Place order · Rs 9,700')
    expect(api.post.mock.calls[0][1].paymentMethod).toBe('COD')
    expect(mockRouter.replace).toHaveBeenCalledWith('/order-placed')
  })

  it('the placed page says to pay in cash and has no Pay buttons', async () => {
    rememberPlacedOrders([{ _id: ID(5), orderNumber: 'CC-1', paymentMethod: 'COD', total: 7200, items: [{}] }])
    const renderer = await show(<OrderPlaced />, auth())
    expect(screenText(renderer)).toContain('Order placed!')
    expect(screenText(renderer)).toContain('in cash when it arrives')
    expect(screenText(renderer)).not.toContain('for CC-1') // no "Pay Rs ... for CC-1" button
  })
})

describe('where my rider is', () => {
  const OUT = { _id: ID(9), status: 'OUT_FOR_DELIVERY', assignedAgent: 'Bilal Ahmed' }
  // The customer's checkout pin, as the order keeps it: GeoJSON [longitude, latitude].
  const ON_THE_ROAD = { ...ORDER, orderStatus: 'OUT_FOR_DELIVERY', deliveryLocation: { type: 'Point', coordinates: [73.06, 31.42] } }
  const serve = (location, delivery = OUT) => {
    mockParams = { id: ON_THE_ROAD._id }
    api.get.mockImplementation(async (url) => {
      if (url === `/orders/${ON_THE_ROAD._id}`) return { data: { order: ON_THE_ROAD, payment: { status: 'PENDING' }, delivery } }
      if (url === `/deliveries/${delivery._id}/code`) return { data: { code: '482913' } }
      if (url === `/deliveries/${delivery._id}/rider-location`) {
        if (location instanceof Error) throw location
        return { data: { location } }
      }
      throw new Error(`unexpected GET ${url}`)
    })
  }
  const mapProps = (renderer) => renderer.root.findAll((n) => n.props.testID === 'map' && n.props.rider !== undefined)[0]?.props

  it('shows the rider on a map inside the order, with the delivery pin, while out for delivery', async () => {
    serve({ latitude: 31.4181, longitude: 73.0776, accuracy: 12, recordedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString() })
    const renderer = await show(<OrderScreen />, auth())
    expect(screenText(renderer)).toContain('Your rider')
    expect(screenText(renderer)).toContain('Last seen 4m ago')
    expect(screenText(renderer)).toContain('may have other orders')
    expect(mapProps(renderer)).toMatchObject({
      rider: { lat: 31.4181, lng: 73.0776 },
      pin: { lat: 31.42, lng: 73.06 },
      originLabel: 'Your delivery address',
    })
  })

  it('moves the dot as new positions arrive, staying inside the app', async () => {
    jest.useFakeTimers()
    try {
      let position = { latitude: 31.4181, longitude: 73.0776, recordedAt: new Date().toISOString() }
      mockParams = { id: ON_THE_ROAD._id }
      api.get.mockImplementation(async (url) => {
        if (url === `/orders/${ON_THE_ROAD._id}`) return { data: { order: ON_THE_ROAD, payment: { status: 'PENDING' }, delivery: OUT } }
        if (url === `/deliveries/${OUT._id}/code`) return { data: { code: '482913' } }
        if (url === `/deliveries/${OUT._id}/rider-location`) return { data: { location: position } }
        throw new Error(`unexpected GET ${url}`)
      })
      const renderer = await show(<OrderScreen />, auth())
      expect(mapProps(renderer).rider).toEqual({ lat: 31.4181, lng: 73.0776 })

      position = { latitude: 31.4199, longitude: 73.0761, recordedAt: new Date().toISOString() }
      await act(async () => {
        jest.advanceTimersByTime(15000)
      })
      await tick()

      expect(mapProps(renderer).rider).toEqual({ lat: 31.4199, lng: 73.0761 })
    } finally {
      jest.useRealTimers()
    }
  })

  it('shows nothing, and claims nothing, when the rider is not sharing or the server has none', async () => {
    serve(null)
    expect(screenText(await show(<OrderScreen />, auth()))).not.toContain('Your rider')
    serve(Object.assign(new Error('http'), { response: { status: 404, data: {} } }))
    const text = screenText(await show(<OrderScreen />, auth()))
    expect(text).not.toContain('Your rider')
    expect(text).toContain('CC-20261004-0007') // the rest of the page is fine
  })

  it('is not asked for before the order is out for delivery', async () => {
    serve({ latitude: 1, longitude: 2, recordedAt: new Date().toISOString() }, { ...OUT, status: 'PICKED_UP' })
    await show(<OrderScreen />, auth())
    expect(api.get).not.toHaveBeenCalledWith(`/deliveries/${OUT._id}/rider-location`)
  })
})
