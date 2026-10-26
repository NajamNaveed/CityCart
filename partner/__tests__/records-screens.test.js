/**
 * The records screens (a brand team member): overview, orders, deliveries and
 * rider assignment, receipts, and counting the cash riders hand over.
 */
import React from 'react'
import { Linking } from 'react-native'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
let mockParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    // Like the real one, it runs again whenever it is given a NEW callback: that is what made an un-memoized callback loop on a phone.
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
import Overview from '../src/app/(records)/overview'
import Orders from '../src/app/(records)/orders'
import Shipments from '../src/app/(records)/shipments'
import Money from '../src/app/(records)/money'
import Profile from '../src/app/(records)/profile'
import OrderScreen from '../src/app/order/[id]'
import ShipmentScreen from '../src/app/shipment/[id]'
import ReceiptScreen from '../src/app/receipt/[id]'
import HandoverScreen from '../src/app/handover/[collectorId]'
import { cleanup, has, press, pressByLabel, RIDER, screenText, show, signedIn } from './helpers/screens'

const ALL = ['orders.view', 'delivery.view', 'delivery.manage', 'riders.view', 'payments.view', 'payments.manage']
const member = (...permissions) => signedIn({ id: 'u2', name: 'Maryam Javed', email: 'maryam@example.com', role: 'BRAND_EMPLOYEE', permissions })
const NOW = new Date().toISOString()
const ADDRESS = { name: 'Sana Iqbal', phone: '+92 300 1112223', address: 'House 5, Street 2', city: 'Faisalabad', postalCode: '38000' }
const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } })

const ORDER = {
  _id: 'o1', orderNumber: 'CC-2026-000042', orderStatus: 'OUT_FOR_DELIVERY', paymentMethod: 'COD', paymentStatus: 'PENDING', createdAt: NOW,
  shippingAddress: ADDRESS, subtotal: 2400, deliveryFee: 50, discount: 0, total: 2450,
  items: [{ productName: 'Printed lawn suit', quantity: 2, unitPrice: 1200, totalPrice: 2400 }],
  statusHistory: [{ status: 'PENDING', at: NOW }, { status: 'CONFIRMED', at: NOW }, { status: 'OUT_FOR_DELIVERY', at: NOW }],
}
const DELIVERY = { _id: 'd1', orderId: 'o1', orderNumber: 'CC-2026-000042', status: 'OUT_FOR_DELIVERY', assignedAgent: 'Bilal Ahmed', riderId: 'r1', trackingReference: 'TRK-9', address: ADDRESS, updatedAt: NOW, createdAt: NOW }
const RECEIPT = {
  _id: 'x1', receiptNumber: 'RC-2026-000012', orderNumber: 'CC-2026-000042', brandName: 'Loom & Co.', billedTo: 'Sana Iqbal', method: 'COD', amount: 2450, subtotal: 2400, deliveryFee: 50, discount: 0, tax: 0,
  items: [{ productName: 'Printed lawn suit', quantity: 2, unitPrice: 1200, totalPrice: 2400 }], transactionReference: 'RCPT-000042', collectedByName: 'Shoaib Raza', issuedAt: NOW,
}
const page = (key, items) => ({ data: { [key]: items, pagination: { page: 1, pages: 1, total: items.length } } })

// A tiny fake server: a table of "METHOD url" to answers.
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

describe('overview', () => {
  const counts = { READY_FOR_PICKUP: 4, PICKED_UP: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, FAILED: 5, DELIVERED: 40 }
  const serveOverview = () =>
    serve({
      'GET /deliveries': (config) => ({ data: { pagination: { total: counts[config.params.status] } } }),
      'GET /payments/cash/outstanding': { data: { collectors: [{ collectorId: 'c1', total: 1000 }, { collectorId: 'c2', total: 250 }] } },
    })

  it('greets the person and shows what is happening, with cash still held by riders', async () => {
    serveOverview()
    const screen = await show(<Overview />, { auth: member(...ALL) })
    const text = screenText(screen)
    expect(text).toMatch(/Hello, Maryam Javed/)
    expect(text).toMatch(/To pick up \| 4/)
    expect(text).toMatch(/On the road \| 6/) // picked up + in transit + out for delivery
    expect(text).toMatch(/Failed \| 5/)
    expect(text).toMatch(/Delivered \| 40/)
    expect(text).toMatch(/Rs 1,250/)
    expect(text).toMatch(/2 people to hand it over/)
  })

  it('opens the delivery list already filtered when a tile is tapped', async () => {
    serveOverview()
    const screen = await show(<Overview />, { auth: member(...ALL) })
    await pressByLabel(screen, 'Failed')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/shipments', params: { status: 'FAILED' } })
    await pressByLabel(screen, 'Cash with riders')
    expect(mockRouter.push).toHaveBeenLastCalledWith('/money')
  })

  it('shows only what the person may see: no delivery or cash requests without those permissions', async () => {
    serve({})
    const screen = await show(<Overview />, { auth: member('orders.view') })
    expect(api.get).not.toHaveBeenCalled()
    expect(screenText(screen)).toMatch(/Open Orders to see the orders of your brand/)
    expect(screenText(screen)).not.toMatch(/To pick up/)
  })

  it('says so, kindly, when the person has been given no access yet', async () => {
    serve({})
    const screen = await show(<Overview />, { auth: member() })
    expect(screenText(screen)).toMatch(/Your brand has not given you access to anything yet/)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('still opens, with nothing to show, when both parts fail to load (a part never takes the whole screen down)', async () => {
    serve({ 'GET /deliveries': httpError(500, { message: 'Server error' }), 'GET /payments/cash/outstanding': httpError(500, { message: 'Server error' }) })
    const screen = await show(<Overview />, { auth: member(...ALL) })
    expect(screenText(screen)).toMatch(/Overview/)
    expect(screenText(screen)).not.toMatch(/Couldn't load/)
  })
})

describe('orders', () => {
  it('lists the brand orders with customer, total and status, and opens one', async () => {
    serve({ 'GET /brand/orders': page('orders', [ORDER]) })
    const screen = await show(<Orders />, { auth: member(...ALL) })
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Sana Iqbal, Faisalabad/)
    expect(text).toMatch(/Rs 2,450/)
    expect(text).toMatch(/Out for delivery/)
    await pressByLabel(screen, 'CC-2026-000042')
    expect(mockRouter.push).toHaveBeenCalledWith('/order/o1')
  })

  it('filters by status', async () => {
    serve({ 'GET /brand/orders': (config) => page('orders', config.params.status === 'DELIVERED' ? [{ ...ORDER, _id: 'o9', orderNumber: 'CC-2026-000007', orderStatus: 'DELIVERED' }] : [ORDER]) })
    const screen = await show(<Orders />, { auth: member(...ALL) })
    await press(screen, 'Delivered')
    expect(api.get).toHaveBeenLastCalledWith('/brand/orders', { params: { status: 'DELIVERED', page: 1, limit: 20 } })
    expect(screenText(screen)).toMatch(/CC-2026-000007/)
  })

  it('has empty and error states', async () => {
    serve({ 'GET /brand/orders': page('orders', []) })
    expect(screenText(await show(<Orders />, { auth: member(...ALL) }))).toMatch(/No orders here/)
    serve({ 'GET /brand/orders': httpError(403, { message: 'Forbidden' }) })
    expect(screenText(await show(<Orders />, { auth: member(...ALL) }))).toMatch(/Couldn't load orders/)
  })
})

describe('one order', () => {
  const open = (extra = {}, auth = member(...ALL)) => {
    mockParams = { id: 'o1' }
    serve({ 'GET /brand/orders/o1': { data: { order: ORDER, payment: { status: 'PENDING' }, delivery: DELIVERY, ...extra } } })
    return show(<OrderScreen />, { auth })
  }

  it('shows progress, items, totals, payment and the customer', async () => {
    const screen = await open()
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Confirmed/)
    expect(text).toMatch(/2 × Printed lawn suit/)
    expect(text).toMatch(/Subtotal/)
    expect(text).toMatch(/Rs 2,450/)
    expect(text).toMatch(/Cod, Pending/)
    expect(text).toMatch(/House 5, Street 2, Faisalabad/)
  })

  it('links to the delivery only for someone who may see deliveries', async () => {
    let screen = await open()
    await press(screen, 'Delivery: Out for delivery')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/shipment/d1', params: { orderNumber: 'CC-2026-000042' } })

    screen = await open({}, member('orders.view'))
    expect(has(screen, 'Delivery: Out for delivery')).toBe(false)
  })

  it('says when the order is not found', async () => {
    mockParams = { id: 'zzz' }
    serve({ 'GET /brand/orders/zzz': httpError(404, { message: 'Order not found.' }) })
    expect(screenText(await show(<OrderScreen />, { auth: member(...ALL) }))).toMatch(/Order not found/)
  })
})

describe('deliveries', () => {
  it('lists them with the rider and city, and opens one with its order number', async () => {
    serve({ 'GET /deliveries': page('deliveries', [DELIVERY, { ...DELIVERY, _id: 'd2', orderNumber: 'CC-2026-000043', assignedAgent: undefined, status: 'READY_FOR_PICKUP' }]) })
    const screen = await show(<Shipments />, { auth: member(...ALL) })
    const text = screenText(screen)
    expect(text).toMatch(/Bilal Ahmed, Faisalabad/)
    expect(text).toMatch(/No rider yet, Faisalabad/)
    await pressByLabel(screen, 'CC-2026-000042')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/shipment/d1', params: { orderNumber: 'CC-2026-000042' } })
  })

  it('opens already filtered when the overview sent a status', async () => {
    mockParams = { status: 'FAILED' }
    serve({ 'GET /deliveries': page('deliveries', []) })
    await show(<Shipments />, { auth: member(...ALL) })
    expect(api.get).toHaveBeenCalledWith('/deliveries', { params: { status: 'FAILED', page: 1, limit: 20 } })
  })
})

describe('one delivery and its rider', () => {
  const RIDERS = [{ _id: 'r1', name: 'Bilal Ahmed' }, { _id: 'r2', name: 'Imran Bashir' }]
  const open = (auth = member(...ALL), delivery = DELIVERY, location = null) => {
    mockParams = { id: delivery._id, orderNumber: 'CC-2026-000042' }
    serve({
      [`GET /deliveries/${delivery._id}`]: { data: { delivery } },
      'GET /riders': { data: { riders: RIDERS } },
      [`GET /deliveries/${delivery._id}/rider-location`]: { data: { location } },
      [`PATCH /deliveries/${delivery._id}/rider`]: (body) => ({ data: { delivery: { ...delivery, riderId: body.riderId, assignedAgent: RIDERS.find((r) => r._id === body.riderId)?.name } } }),
    })
    return show(<ShipmentScreen />, { auth })
  }

  it('shows the rider, the tracking reference and where it is going, and never the delivery code', async () => {
    const screen = await open()
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Bilal Ahmed/)
    expect(text).toMatch(/Tracking TRK-9/)
    expect(text).toMatch(/Sana Iqbal/)
    expect(text).not.toMatch(/code/i)
  })

  it('gives the delivery to another rider, and tells the person', async () => {
    const screen = await open()
    await pressByLabel(screen, 'Give to Imran Bashir')
    expect(api.patch).toHaveBeenCalledWith('/deliveries/d1/rider', { riderId: 'r2' })
    expect(screenText(screen)).toMatch(/Given to Imran Bashir\. They have been told\./)
  })

  it('takes the rider off', async () => {
    const screen = await open()
    await press(screen, 'Remove rider')
    expect(api.patch).toHaveBeenCalledWith('/deliveries/d1/rider', { riderId: null })
    expect(screenText(screen)).toMatch(/Rider removed/)
  })

  it('shows the server\'s reason if the rider cannot be assigned', async () => {
    const screen = await open()
    api.patch.mockRejectedValue(httpError(409, { message: 'A DELIVERED delivery can no longer be edited.' }))
    await pressByLabel(screen, 'Give to Imran Bashir')
    expect(screenText(screen)).toMatch(/can no longer be edited/)
  })

  it('without permission to assign, the person can look but not change', async () => {
    const screen = await open(member('delivery.view'))
    expect(screenText(screen)).toMatch(/You can see this delivery but not change its rider/)
    expect(api.get).not.toHaveBeenCalledWith('/riders', expect.anything())
    expect(has(screen, 'Remove rider')).toBe(false)
  })

  describe('where the rider is', () => {
    const POINT = { latitude: 31.4181, longitude: 73.0776, accuracy: 12, recordedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString() }

    it('shows when the rider was last seen and opens it in Maps, while the order is out for delivery', async () => {
      const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
      const screen = await open(member(...ALL), DELIVERY, POINT)
      expect(screenText(screen)).toMatch(/Rider location/)
      expect(screenText(screen)).toMatch(/Last seen 3m ago/)
      await press(screen, 'Open in Maps')
      expect(spy).toHaveBeenCalledWith('https://www.google.com/maps/search/?api=1&query=31.4181,73.0776')
      spy.mockRestore()
    })

    it('says so, and claims nothing, when the rider is not sharing', async () => {
      const screen = await open(member(...ALL), DELIVERY, null)
      expect(screenText(screen)).toMatch(/not sharing their location right now/)
      expect(has(screen, 'Open in Maps')).toBe(false)
    })

    it('is never even asked for while the delivery is not out for delivery, or has no rider', async () => {
      await open(member(...ALL), { ...DELIVERY, status: 'PICKED_UP' }, POINT)
      expect(api.get).not.toHaveBeenCalledWith('/deliveries/d1/rider-location')
      api.get.mockClear()
      await open(member(...ALL), { ...DELIVERY, riderId: undefined }, POINT)
      expect(api.get).not.toHaveBeenCalledWith('/deliveries/d1/rider-location')
    })

    it('can be refreshed', async () => {
      const screen = await open(member(...ALL), DELIVERY, POINT)
      const before = api.get.mock.calls.filter(([url]) => url === '/deliveries/d1/rider-location').length
      await press(screen, 'Refresh')
      const after = api.get.mock.calls.filter(([url]) => url === '/deliveries/d1/rider-location').length
      expect(after).toBe(before + 1)
    })
  })

  it('a finished delivery cannot be reassigned', async () => {
    const screen = await open(member(...ALL), { ...DELIVERY, status: 'DELIVERED' })
    expect(has(screen, 'Remove rider')).toBe(false)
    expect(screenText(screen)).not.toMatch(/Give to/)
  })
})

describe('money', () => {
  it('lists receipts and opens one', async () => {
    serve({ 'GET /receipts': page('receipts', [{ _id: 'x1', receiptNumber: 'RC-2026-000012', orderNumber: 'CC-2026-000042', method: 'COD', amount: 2450, issuedAt: NOW }]) })
    const screen = await show(<Money />, { auth: member(...ALL) })
    expect(screenText(screen)).toMatch(/RC-2026-000012/)
    expect(screenText(screen)).toMatch(/Rs 2,450/)
    await pressByLabel(screen, 'RC-2026-000012')
    expect(mockRouter.push).toHaveBeenCalledWith('/receipt/x1')
  })

  it('switches to the cash riders hold, with the total, and opens a hand-over', async () => {
    serve({
      'GET /receipts': page('receipts', []),
      'GET /payments/cash/outstanding': { data: { collectors: [{ collectorId: 'c1', name: 'Shoaib Raza', count: 3, total: 7350, oldest: NOW }] } },
    })
    const screen = await show(<Money />, { auth: member(...ALL) })
    await press(screen, 'Cash')
    const text = screenText(screen)
    expect(text).toMatch(/Cash still with riders/)
    expect(text).toMatch(/Rs 7,350/)
    expect(text).toMatch(/3 payments/)
    await pressByLabel(screen, 'Shoaib Raza')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/handover/c1', params: { name: 'Shoaib Raza' } })
  })

  it('says when no cash is waiting', async () => {
    serve({ 'GET /receipts': page('receipts', []), 'GET /payments/cash/outstanding': { data: { collectors: [] } } })
    const screen = await show(<Money />, { auth: member(...ALL) })
    await press(screen, 'Cash')
    expect(screenText(screen)).toMatch(/No cash waiting/)
  })
})

describe('one receipt', () => {
  it('shows what was paid, for what, and who took the cash', async () => {
    mockParams = { id: 'x1' }
    serve({ 'GET /receipts/x1': { data: { receipt: RECEIPT } } })
    const text = screenText(await show(<ReceiptScreen />, { auth: member(...ALL) }))
    expect(text).toMatch(/RC-2026-000012/)
    expect(text).toMatch(/Loom & Co\./)
    expect(text).toMatch(/Sana Iqbal/)
    expect(text).toMatch(/2 × Printed lawn suit/)
    expect(text).toMatch(/Paid \| Rs 2,450/)
    expect(text).toMatch(/RCPT-000042/)
    expect(text).toMatch(/Shoaib Raza/)
  })

  it('says when it is not found', async () => {
    mockParams = { id: 'nope' }
    serve({ 'GET /receipts/nope': httpError(404, { message: 'Receipt not found.' }) })
    expect(screenText(await show(<ReceiptScreen />, { auth: member(...ALL) }))).toMatch(/Receipt not found/)
  })
})

describe('counting the cash a rider hands over', () => {
  const PAYMENTS = [
    { paymentId: 'p1', orderNumber: 'CC-2026-000042', amount: 2450, collectedAt: NOW },
    { paymentId: 'p2', orderNumber: 'CC-2026-000043', amount: 900, collectedAt: NOW },
    { paymentId: 'p3', orderNumber: 'CC-2026-000044', amount: 4000, collectedAt: NOW },
  ]
  const open = (auth = member(...ALL)) => {
    mockParams = { collectorId: 'c1', name: 'Shoaib Raza' }
    serve({
      'GET /payments/cash/outstanding': { data: { payments: PAYMENTS, total: 7350 } },
      'POST /payments/cash/settle': (body) => ({ data: { settled: body.paymentIds.length, total: PAYMENTS.filter((p) => body.paymentIds.includes(p.paymentId)).reduce((s, p) => s + p.amount, 0) } }),
    })
    return show(<HandoverScreen />, { auth })
  }

  it('shows what the person holds and each payment', async () => {
    const screen = await open()
    expect(api.get).toHaveBeenCalledWith('/payments/cash/outstanding', { params: { collectorId: 'c1' } })
    const text = screenText(screen)
    expect(text).toMatch(/Shoaib Raza is holding/)
    expect(text).toMatch(/Rs 7,350/)
    expect(text).toMatch(/CC-2026-000043/)
    expect(has(screen, 'Select all')).toBe(true)
  })

  it('settles exactly the payments that were ticked, after asking to confirm', async () => {
    const screen = await open()
    await pressByLabel(screen, 'CC-2026-000042')
    await pressByLabel(screen, 'CC-2026-000043')
    expect(has(screen, 'Mark Rs 3,350 received')).toBe(true) // 2,450 + 900

    await press(screen, 'Mark Rs 3,350 received')
    expect(screenText(screen)).toMatch(/Confirm you received Rs 3,350 from Shoaib Raza\?/)
    expect(api.post).not.toHaveBeenCalled() // nothing is sent until the person confirms

    await press(screen, 'Yes, received')
    expect(api.post).toHaveBeenCalledWith('/payments/cash/settle', { collectorId: 'c1', paymentIds: ['p1', 'p2'] })
    expect(screenText(screen)).toMatch(/Marked Rs 3,350 as received from Shoaib Raza/)
  })

  it('selects everything with one tap', async () => {
    const screen = await open()
    await press(screen, 'Select all')
    expect(has(screen, 'Mark Rs 7,350 received')).toBe(true)
  })

  it('can be cancelled at the confirmation without sending anything', async () => {
    const screen = await open()
    await pressByLabel(screen, 'CC-2026-000044')
    await press(screen, 'Mark Rs 4,000 received')
    await press(screen, 'Cancel')
    expect(api.post).not.toHaveBeenCalled()
    expect(has(screen, 'Mark Rs 4,000 received')).toBe(true)
  })

  it('tells the person to count again when the cash changed meanwhile', async () => {
    const screen = await open()
    await press(screen, 'Select all')
    await press(screen, 'Mark Rs 7,350 received')
    api.post.mockRejectedValue(httpError(409, { code: 'CASH_CHANGED', message: 'The cash changed since you loaded it. Reload and count again.' }))
    await press(screen, 'Yes, received')
    expect(screenText(screen)).toMatch(/The cash changed since you opened this/)
    expect(has(screen, 'Mark Rs 7,350 received')).toBe(false) // the selection was cleared
  })

  it('shows another reason if the server refuses', async () => {
    const screen = await open()
    await press(screen, 'Select all')
    await press(screen, 'Mark Rs 7,350 received')
    api.post.mockRejectedValue(httpError(403, { message: 'You do not have permission to do this.' }))
    await press(screen, 'Yes, received')
    expect(screenText(screen)).toMatch(/do not have permission/)
  })

  it('a team member who cannot manage payments can only look', async () => {
    const screen = await open(member('payments.view'))
    expect(screenText(screen)).toMatch(/Only team members who manage payments can mark cash as received/)
    expect(has(screen, 'Select all')).toBe(false)
    expect(screenText(screen)).toMatch(/CC-2026-000042/)
  })

  it('says when everything has been handed over', async () => {
    mockParams = { collectorId: 'c1', name: 'Shoaib Raza' }
    serve({ 'GET /payments/cash/outstanding': { data: { payments: [], total: 0 } } })
    expect(screenText(await show(<HandoverScreen />, { auth: member(...ALL) }))).toMatch(/All handed over/)
  })
})

describe('account', () => {
  it('lists what the person can see, and signs out', async () => {
    const auth = member('orders.view', 'payments.view')
    const screen = await show(<Profile />, { auth })
    expect(screenText(screen)).toMatch(/Brand team/)
    expect(screenText(screen)).toMatch(/You can see: Orders, Money\./)
    await press(screen, 'Sign out')
    expect(auth.logout).toHaveBeenCalled()
  })

  it('is never shown to a rider (the records screens belong to team members)', async () => {
    mockParams = { id: 'o1' }
    expect(screenText(await show(<OrderScreen />, { auth: signedIn(RIDER) }))).toBe('redirect:/')
  })
})
