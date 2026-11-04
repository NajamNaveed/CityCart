/**
 * The returned-goods inbox (a brand team member, docs/22 §F): what riders are
 * bringing back, why, and the store taking the goods in — restock or write off.
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
import Returns from '../src/app/(records)/returns'
import ReturnScreen from '../src/app/return/[id]'
import { cleanup, has, press, pressByLabel, screenText, show, signedIn } from './helpers/screens'

const ALL = ['orders.view', 'delivery.view', 'delivery.manage', 'riders.view', 'payments.view', 'payments.manage']
const member = (...permissions) => signedIn({ id: 'u2', name: 'Maryam Javed', email: 'maryam@example.com', role: 'BRAND_EMPLOYEE', permissions })
const NOW = new Date().toISOString()
const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } })
const page = (items) => ({ data: { returns: items, pagination: { page: 1, pages: 1, total: items.length } } })

const RETURN = {
  _id: 'r1', orderId: 'o1', orderNumber: 'CC-2026-000042', deliveryId: 'd1', status: 'IN_TRANSIT', source: 'DOOR',
  lines: [
    { orderItemId: 'i1', productId: 'p1', productName: 'Printed lawn suit', quantity: 1, unitPrice: 1100, reason: 'DAMAGED', restock: false, restockedAt: null, hasPhoto: true },
    { orderItemId: 'i2', productId: 'p2', productName: 'Cotton scarf', quantity: 2, unitPrice: 300, reason: 'NOT_WANTED', restock: false, restockedAt: null, hasPhoto: false },
  ],
  returnedSubtotal: 1700, feeRefunded: false, refundAmount: 0, currency: 'PKR', receivedAt: null, createdAt: NOW,
}
const received = (over = {}) => ({
  ...RETURN,
  status: 'RECEIVED',
  receivedAt: NOW,
  lines: [
    { ...RETURN.lines[0], restock: true, restockedAt: NOW },
    { ...RETURN.lines[1] },
  ],
  ...over,
})

function serve(routes) {
  const answer = async (method, url, body) => {
    const route = routes[`${method} ${url}`]
    if (!route) throw new Error(`unexpected ${method} ${url} ${JSON.stringify(body || '')}`)
    const result = typeof route === 'function' ? route(body) : route
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

describe('the returned-goods inbox', () => {
  it('lists what is coming back, with the value and status, and opens one', async () => {
    serve({ 'GET /returns': page([RETURN]) })
    const screen = await show(<Returns />, { auth: member(...ALL) })
    const text = screenText(screen)
    expect(text).toMatch(/Returned goods/)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/3 items coming back/)
    expect(text).toMatch(/Rs 1,700/)
    expect(text).toMatch(/In transit/)

    await pressByLabel(screen, 'CC-2026-000042')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/return/r1', params: { orderNumber: 'CC-2026-000042' } })
  })

  it('filters by status, and says when there is nothing', async () => {
    serve({
      'GET /returns': (config) => page(config.params.status === 'RECEIVED' ? [received()] : [RETURN]),
    })
    const screen = await show(<Returns />, { auth: member(...ALL) })
    await press(screen, 'Received')
    expect(api.get).toHaveBeenLastCalledWith('/returns', { params: { status: 'RECEIVED', page: 1, limit: 20 } })
    expect(screenText(screen)).toMatch(/3 items back at the store/)

    serve({ 'GET /returns': page([]) })
    expect(screenText(await show(<Returns />, { auth: member(...ALL) }))).toMatch(/No returns here/)
  })

  it('shows a clear error when the list cannot be loaded', async () => {
    serve({ 'GET /returns': httpError(500, { message: 'Server error' }) })
    expect(screenText(await show(<Returns />, { auth: member(...ALL) }))).toMatch(/Couldn't load returned goods/)
  })
})

describe('one return', () => {
  const open = (over = {}, auth = member(...ALL)) => {
    mockParams = { id: 'r1', orderNumber: 'CC-2026-000042' }
    serve({ 'GET /returns/r1': { data: { return: { ...RETURN, ...over } } } })
    return show(<ReturnScreen />, { auth })
  }

  it('shows the goods, why each line came back, and the money', async () => {
    const screen = await open()
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Printed lawn suit/)
    expect(text).toMatch(/1 × Rs 1,100 · Damaged/)
    expect(text).toMatch(/2 × Rs 300 · Not wanted/)
    expect(text).toMatch(/Rs 1,700 of goods/)
    expect(has(screen, 'Mark received')).toBe(true)
  })

  it('opens a refused line’s photo through a short-lived link', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    const screen = await open()
    api.get.mockResolvedValueOnce({ data: { url: 'https://example.test/photo-r1', expiresAt: NOW } })

    await press(screen, 'View photo')

    expect(api.get).toHaveBeenLastCalledWith('/returns/r1/photo', { params: { line: 0 } })
    expect(openUrl).toHaveBeenLastCalledWith('https://example.test/photo-r1')
    openUrl.mockRestore()
  })

  it('explains why a photo cannot be shown', async () => {
    const screen = await open()
    api.get.mockRejectedValueOnce(httpError(404, { message: 'There is no photo for this line.' }))
    await press(screen, 'View photo')
    expect(screenText(screen)).toMatch(/There is no photo for this line/)
  })

  it('sends every line, restocking only the ticked goods; everything else is written off', async () => {
    const screen = await open()
    serve({
      'GET /returns/r1': { data: { return: RETURN } },
      'POST /returns/r1/receive': { data: { return: received() } },
    })

    await pressByLabel(screen, 'Restock Printed lawn suit')
    await press(screen, 'Mark received')

    expect(api.post).toHaveBeenLastCalledWith('/returns/r1/receive', {
      decisions: [
        { index: 0, restock: true },
        { index: 1, restock: false },
      ],
    })
    const text = screenText(screen)
    expect(text).toMatch(/Received\. 1 line is back on the shelf/)
    expect(text).toMatch(/Restocked/)
    expect(text).toMatch(/Written off/)
    expect(has(screen, 'Mark received')).toBe(false) // received once, never again
  })

  it('writes everything off when nothing is ticked', async () => {
    const screen = await open()
    serve({
      'GET /returns/r1': { data: { return: RETURN } },
      'POST /returns/r1/receive': { data: { return: received({ lines: [RETURN.lines[0], RETURN.lines[1]] }) } },
    })

    await press(screen, 'Mark received')

    expect(api.post).toHaveBeenLastCalledWith('/returns/r1/receive', {
      decisions: [
        { index: 0, restock: false },
        { index: 1, restock: false },
      ],
    })
    expect(screenText(screen)).toMatch(/Everything was written off/)
  })

  it('says so when it was already received by someone else', async () => {
    const screen = await open()
    serve({
      'GET /returns/r1': { data: { return: RETURN } },
      'POST /returns/r1/receive': httpError(409, { message: 'This return has already been received.' }),
    })
    await press(screen, 'Mark received')
    expect(screenText(screen)).toMatch(/already been received/)
    expect(has(screen, 'Mark received')).toBe(true)
  })

  it('a received return shows how each line was handled, and cannot be received again', async () => {
    const screen = await open({ status: 'RECEIVED', receivedAt: NOW, lines: received().lines })
    const text = screenText(screen)
    expect(text).toMatch(/Received/)
    expect(text).toMatch(/Restocked/)
    expect(text).toMatch(/Written off/)
    expect(has(screen, 'Mark received')).toBe(false)
    expect(mockParams.id).toBe('r1')
  })

  it('only someone who may manage deliveries is offered the goods', async () => {
    const screen = await open({}, member('delivery.view'))
    expect(has(screen, 'Mark received')).toBe(false)
    expect(screenText(screen)).toMatch(/cannot take the goods in/)
  })

  it("someone else's (or a missing) return is just 'not found'", async () => {
    mockParams = { id: 'zzz' }
    serve({ 'GET /returns/zzz': httpError(404, { message: 'Return not found.' }) })
    const screen = await show(<ReturnScreen />, { auth: member(...ALL) })
    expect(screenText(screen)).toMatch(/Return not found/)
  })

  it('offers a retry when the return could not be loaded', async () => {
    mockParams = { id: 'r1' }
    serve({ 'GET /returns/r1': httpError(500, { message: 'Server error' }) })
    const screen = await show(<ReturnScreen />, { auth: member(...ALL) })
    expect(screenText(screen)).toMatch(/Couldn't load this return/)
    serve({ 'GET /returns/r1': { data: { return: RETURN } } })
    await press(screen, 'Try again')
    expect(screenText(screen)).toMatch(/Printed lawn suit/)
  })
})
