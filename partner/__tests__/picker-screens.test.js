/**
 * The picker screens: the queue of accepted orders, claiming one, marking
 * every line, proposing a substitute for a short line, and packing.
 * The server never sends a picker prices or customer contact details; these
 * screens show only names, quantities and pick state.
 */
import React from 'react'
import { Image } from 'react-native'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
let mockParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
    Redirect: ({ href }) => <Text>{`redirect:${href}`}</Text>,
    Tabs: () => null,
    Stack: () => null,
  }
})
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
  getFieldErrors: () => ({}),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import PickQueue from '../src/app/(picker)/queue'
import PickerAccount from '../src/app/(picker)/settings'
import PickScreen from '../src/app/pick/[id]'
import { cleanup, has, isDisabled, press, pressByLabel, screenText, show, signedIn, type } from './helpers/screens'

const PICKER = { id: 'p1', name: 'Ali Raza', email: 'ali@example.com', role: 'PICKER' }
const signedInPicker = () => signedIn(PICKER)
const NOW = new Date('2026-11-02T09:00:00.000Z').toISOString()
const LATER = new Date('2026-11-03T09:00:00.000Z').toISOString()
const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } })
const page = (key, items) => ({ data: { [key]: items, pagination: { page: 1, pages: 1, total: items.length } } })

const LINE = { productId: 'pr1', productName: 'Printed lawn suit', sku: 'LS-1', image: 'https://example.test/lawn.jpg', quantity: 2, pickStatus: null, pickedQty: null }
const ONE = { productId: 'pr2', productName: 'Silk scarf', sku: 'SC-2', quantity: 1, pickStatus: 'PICKED', pickedQty: 1 }

const orderView = (overrides = {}) => ({
  _id: 'o1',
  orderNumber: 'CC-2026-000042',
  orderStatus: 'PROCESSING',
  createdAt: NOW,
  pickStartedAt: NOW,
  packedAt: null,
  claimedByMe: true,
  customerFirstName: 'Sana',
  items: [
    { _id: 'i1', ...LINE },
    { _id: 'i2', ...ONE },
  ],
  activeAdjustment: null,
  ...overrides,
})

const QUEUE = [
  { _id: 'o1', orderNumber: 'CC-2026-000042', orderStatus: 'PROCESSING', createdAt: NOW, customerFirstName: 'Sana', itemCount: 2, units: 3, claimedByMe: false, waitingForCustomer: false },
  { _id: 'o2', orderNumber: 'CC-2026-000043', orderStatus: 'CONFIRMED', createdAt: NOW, customerFirstName: 'Adeel', itemCount: 1, units: 1, claimedByMe: false, waitingForCustomer: false },
]

function serve(routes) {
  const answer = async (method, url, config) => {
    const route = routes[`${method} ${url}`]
    if (!route) throw new Error(`unexpected ${method} ${url} ${JSON.stringify(config?.params || '')}`)
    const result = typeof route === 'function' ? route(config) : route
    if (result instanceof Error) throw result
    return result
  }
  api.get.mockImplementation((url, config) => answer('GET', url, config))
  api.post.mockImplementation((url, body) => answer('POST', url, body))
  api.patch.mockImplementation((url, body) => answer('PATCH', url, body))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})
afterEach(cleanup)

describe('pick queue', () => {
  it('lists the brand orders waiting to be picked, without prices', async () => {
    serve({ 'GET /picker': page('orders', QUEUE) })
    const screen = await show(<PickQueue />, { auth: signedInPicker() })
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Sana · 2 items · 3 units/)
    expect(text).toMatch(/Adeel · 1 item · 1 unit/)
    expect(text).toMatch(/Processing/)
    expect(text).not.toMatch(/Rs/)
  })

  it('opens an order', async () => {
    serve({ 'GET /picker': page('orders', QUEUE) })
    const screen = await show(<PickQueue />, { auth: signedInPicker() })
    await pressByLabel(screen, 'CC-2026-000042')
    expect(mockRouter.push).toHaveBeenCalledWith('/pick/o1')
  })

  it('has empty and error states', async () => {
    serve({ 'GET /picker': page('orders', []) })
    expect(screenText(await show(<PickQueue />, { auth: signedInPicker() }))).toMatch(/Nothing to pick/)

    serve({ 'GET /picker': httpError(403, { message: 'Forbidden' }) })
    expect(screenText(await show(<PickQueue />, { auth: signedInPicker() }))).toMatch(/Couldn't load pick queue/)
  })
})

describe('one order to pick', () => {
  const open = (order = orderView(), routes = {}) => {
    mockParams = { id: order._id }
    serve({ [`GET /picker/${order._id}`]: { data: { order } }, ...routes })
    return show(<PickScreen />, { auth: signedInPicker() })
  }

  it('shows only what a picker may see: items, quantities and the first name', async () => {
    const screen = await open(orderView({ ...orderView(), shippingAddress: { name: 'Sana Iqbal', phone: '+92 300 1112223' }, total: 2450 }))
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Printed lawn suit/)
    expect(text).toMatch(/2 ordered/)
    expect(text).toMatch(/Sana/)
    expect(text).not.toMatch(/\+92/)
    expect(text).not.toMatch(/Rs/)
    expect(text).not.toMatch(/House/)
  })

  it("shows each line's photo, and leaves a quiet placeholder when the brand has none", async () => {
    const screen = await open(orderView())
    const photos = screen.root.findAllByType(Image)
    expect(photos).toHaveLength(1) // the silk scarf line has no photo
    expect(photos[0].props.source).toEqual({ uri: 'https://example.test/lawn.jpg' })
    expect(photos[0].props.accessibilityLabel).toBe('Photo of Printed lawn suit')
  })

  it('claims a waiting order before any line can be marked', async () => {
    const waiting = orderView({ orderStatus: 'CONFIRMED', claimedByMe: false, pickStartedAt: null })
    const claimed = orderView()
    const screen = await open(waiting, { 'POST /picker/o1/claim': { data: { order: claimed } } })
    expect(screenText(screen)).toMatch(/Waiting to be picked/)
    expect(has(screen, 'Picked')).toBe(false)

    await press(screen, 'Claim this order')
    expect(api.post).toHaveBeenCalledWith('/picker/o1/claim')
    expect(screenText(screen)).toMatch(/This order is yours/)
    expect(has(screen, 'Picked')).toBe(true)
  })

  it('marks a line picked, short with the units found, or unavailable', async () => {
    const short = orderView({ items: [{ _id: 'i1', ...LINE, pickStatus: 'SHORT', pickedQty: 1 }, { _id: 'i2', ...ONE }] })
    const screen = await open(orderView(), {
      'PATCH /picker/o1/items/i1': (body) => ({ data: { order: body.pickStatus === 'SHORT' ? short : orderView({ items: [{ _id: 'i1', ...LINE, pickStatus: body.pickStatus, pickedQty: 2 }, { _id: 'i2', ...ONE }] }) } }),
    })

    await press(screen, 'Short')
    expect(screenText(screen)).toMatch(/Units found/)
    await type(screen, 'Units found', '1')
    await press(screen, 'Save short pick')
    expect(api.patch).toHaveBeenCalledWith('/picker/o1/items/i1', { pickStatus: 'SHORT', pickedQty: 1 })
    expect(screenText(screen)).toMatch(/Found 1 of 2/)
  })

  it('asks the customer about a short line, with a same-store substitute', async () => {
    const short = orderView({ items: [{ _id: 'i1', ...LINE, pickStatus: 'SHORT', pickedQty: 1 }, { _id: 'i2', ...ONE }] })
    const waiting = orderView({
      items: short.items,
      activeAdjustment: { _id: 'a1', status: 'PROPOSED', note: 'Only one suit was on the shelf.', expiresAt: LATER, proposedByRole: 'PICKER' },
    })
    let loads = 0
    const screen = await open(orderView(), {
      'PATCH /picker/o1/items/i1': { data: { order: short } },
      'GET /picker/products': { data: { products: [{ _id: 'pr9', name: 'Embroidered suit', sku: 'LS-9', image: 'https://example.test/embroidery.jpg' }] } },
      'POST /picker/o1/propose': { data: { adjustment: { _id: 'a1' } } },
      // The first load is the order before the proposal; the reload after sending shows it waiting.
      'GET /picker/o1': () => ({ data: { order: (loads += 1) === 1 ? orderView() : waiting } }),
    })

    await press(screen, 'Short')
    await press(screen, 'Save short pick')
    expect(has(screen, 'Pack order')).toBe(true)
    expect(isDisabled(screen, 'Pack order')).toBe(true)

    await press(screen, 'Send change proposal')
    await press(screen, 'Offer a substitute')
    await type(screen, 'Find a product', 'suit')
    await press(screen, 'Search')
    expect(api.get).toHaveBeenCalledWith('/picker/products', { params: { q: 'suit', limit: 20 } })
    expect(screen.root.findAllByType(Image).some((image) => image.props.source?.uri === 'https://example.test/embroidery.jpg')).toBe(true)
    await pressByLabel(screen, 'Use Embroidered suit')
    expect(screenText(screen)).toMatch(/Instead: 1 × Embroidered suit/)

    await type(screen, 'Message to the customer', 'Only one suit was on the shelf.')
    await press(screen, 'Send proposal')
    expect(api.post).toHaveBeenCalledWith('/picker/o1/propose', {
      note: 'Only one suit was on the shelf.',
      substitutes: [{ orderItemId: 'i1', productId: 'pr9', quantity: 1 }],
    })
    expect(screenText(screen)).toMatch(/Waiting for the customer/)
    expect(screenText(screen)).toMatch(/Suggested by you/)
    expect(has(screen, 'Picked')).toBe(false)
  })

  it('needs a message before a proposal can be sent', async () => {
    const short = orderView({ items: [{ _id: 'i1', ...LINE, pickStatus: 'SHORT', pickedQty: 1 }, { _id: 'i2', ...ONE }] })
    const screen = await open(short)
    await press(screen, 'Send change proposal')
    expect(isDisabled(screen, 'Send proposal')).toBe(true)
    await type(screen, 'Message to the customer', 'Too short')
    expect(isDisabled(screen, 'Send proposal')).toBe(false)
  })

  it('packs only once every line is picked, after confirming', async () => {
    const packed = orderView({ orderStatus: 'READY_FOR_SHIPMENT', packedAt: NOW, items: [{ _id: 'i1', ...LINE, pickStatus: 'PICKED', pickedQty: 2 }, { _id: 'i2', ...ONE }] })
    const screen = await open(orderView({ items: [{ _id: 'i1', ...LINE, pickStatus: 'PICKED', pickedQty: 2 }, { _id: 'i2', ...ONE }] }), {
      'POST /picker/o1/pack': { data: { order: packed } },
    })

    await press(screen, 'Pack order')
    expect(screenText(screen)).toMatch(/Ready for a rider\?/)
    expect(api.post).not.toHaveBeenCalled()

    await press(screen, 'Yes, packed')
    expect(api.post).toHaveBeenCalledWith('/picker/o1/pack')
    expect(screenText(screen)).toMatch(/Packed and ready for a rider/)
    expect(screenText(screen)).toMatch(/Back to the queue/)
  })

  it('will not pack while a line is still unchecked', async () => {
    const screen = await open(orderView())
    expect(isDisabled(screen, 'Pack order')).toBe(true)
    expect(screenText(screen)).toMatch(/Every line must be picked in full before packing/)
  })

  it('shows a waiting proposal as locked, and can check again', async () => {
    const waiting = orderView({
      items: [{ _id: 'i1', ...LINE, pickStatus: 'SHORT', pickedQty: 1 }, { _id: 'i2', ...ONE }],
      activeAdjustment: { _id: 'a1', status: 'PROPOSED', note: 'Only one was on the shelf.', expiresAt: LATER, proposedByRole: 'PICKER' },
    })
    const screen = await open(waiting)
    const text = screenText(screen)
    expect(text).toMatch(/Waiting for the customer/)
    expect(text).toMatch(/Only one was on the shelf/)
    expect(has(screen, 'Picked')).toBe(false)

    await press(screen, 'Check again')
    expect(api.get.mock.calls.filter(([url]) => url === '/picker/o1').length).toBe(2)
  })

  it('says when the order is not theirs to see', async () => {
    mockParams = { id: 'zip' }
    serve({ 'GET /picker/zip': httpError(404, { message: 'Order not found.' }) })
    expect(screenText(await show(<PickScreen />, { auth: signedInPicker() }))).toMatch(/Order not found/)
  })

  it('reloads when another picker has taken the order', async () => {
    const screen = await open(orderView({ claimedByMe: false, orderStatus: 'CONFIRMED' }), {
      'POST /picker/o1/claim': httpError(409, { code: 'PICK_TAKEN', message: 'Another picker is already working on this order.' }),
    })
    await press(screen, 'Claim this order')
    expect(screenText(screen)).toMatch(/Another picker is already working on this order/)
    expect(api.get.mock.calls.filter(([url]) => url === '/picker/o1').length).toBe(2)
  })
})

describe('picker account', () => {
  it('shows who they are and signs out', async () => {
    const auth = signedInPicker()
    const screen = await show(<PickerAccount />, { auth })
    expect(screenText(screen)).toMatch(/Ali Raza/)
    expect(screenText(screen)).toMatch(/Picker/)
    await press(screen, 'Sign out')
    expect(auth.logout).toHaveBeenCalled()
  })
})
