jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }))

import api from '../src/services/api'
import {
  canCancel,
  cancelOrder,
  checkoutFieldErrors,
  countWords,
  currentStage,
  fetchMyOrders,
  fetchOrder,
  MAX_NOTE_WORDS,
  orderBody,
  placeOrder,
  rememberPlacedOrders,
  stageRows,
  takePlacedOrders,
  validateCheckout,
} from '../src/services/orders'
import { formatDateTime } from '../src/utils/format'

beforeEach(() => jest.clearAllMocks())

const good = { fullName: 'Sana Iqbal', phone: '+92 300 1234567', addressLine: 'House 41, Street 5, Peoples Colony No. 1', city: 'Faisalabad', postalCode: '38000', additionalInstructions: 'Blue gate, call on arrival.' }

describe('countWords', () => {
  it('counts words, not characters', () => {
    expect(countWords('Blue gate, call on arrival.')).toBe(5)
    expect(countWords('  spaced   out  ')).toBe(2)
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })
})

describe('validateCheckout (the server\'s rules, checked first on the phone)', () => {
  it('accepts a complete address', () => {
    expect(validateCheckout(good)).toEqual({})
    expect(validateCheckout({ ...good, postalCode: '' })).toEqual({}) // the postal code is optional
  })

  it('asks for every required field', () => {
    expect(Object.keys(validateCheckout({})).sort()).toEqual(['additionalInstructions', 'addressLine', 'city', 'fullName', 'phone'])
    expect(Object.keys(validateCheckout({ ...good, fullName: '   ', city: ' ' })).sort()).toEqual(['city', 'fullName'])
  })

  it('checks the phone number format', () => {
    for (const ok of ['+92 300 1234567', '0300-1234567', '03001234567', '+923001234567', '041 8714305']) expect(validateCheckout({ ...good, phone: ok })).toEqual({})
    for (const bad of ['', 'abc', '12345', '+92', '(0300) 1234567', '0300 123 4567 89012 3456 789', 'call me']) expect(validateCheckout({ ...good, phone: bad })).toHaveProperty('phone')
  })

  it('requires delivery notes of at least one and at most 200 words', () => {
    expect(validateCheckout({ ...good, additionalInstructions: '' })).toHaveProperty('additionalInstructions')
    expect(validateCheckout({ ...good, additionalInstructions: '   ' })).toHaveProperty('additionalInstructions')
    expect(validateCheckout({ ...good, additionalInstructions: 'ok' })).toEqual({})
    expect(validateCheckout({ ...good, additionalInstructions: Array(MAX_NOTE_WORDS).fill('w').join(' ') })).toEqual({})
    expect(validateCheckout({ ...good, additionalInstructions: Array(MAX_NOTE_WORDS + 1).fill('w').join(' ') }).additionalInstructions).toMatch(/at most 200 words/)
  })

  it('enforces the length limits', () => {
    expect(validateCheckout({ ...good, fullName: 'x'.repeat(101) })).toHaveProperty('fullName')
    expect(validateCheckout({ ...good, addressLine: 'x'.repeat(301) })).toHaveProperty('addressLine')
    expect(validateCheckout({ ...good, city: 'x'.repeat(101) })).toHaveProperty('city')
    expect(validateCheckout({ ...good, postalCode: '1'.repeat(21) })).toHaveProperty('postalCode')
  })
})

describe('orderBody', () => {
  it('sends cash on delivery and only the address; the server reads the cart itself', () => {
    expect(orderBody(good)).toEqual({
      paymentMethod: 'COD',
      shippingAddress: {
        fullName: 'Sana Iqbal',
        phone: '+92 300 1234567',
        addressLine: 'House 41, Street 5, Peoples Colony No. 1',
        city: 'Faisalabad',
        postalCode: '38000',
        additionalInstructions: 'Blue gate, call on arrival.',
      },
    })
  })

  it('trims everything and leaves out an empty postal code', () => {
    const body = orderBody({ ...good, fullName: '  Sana ', postalCode: '   ' })
    expect(body.shippingAddress.fullName).toBe('Sana')
    expect(body.shippingAddress).not.toHaveProperty('postalCode')
  })
})

describe('checkoutFieldErrors', () => {
  it('moves the server\'s "shippingAddress.phone" under the phone field', () => {
    expect(checkoutFieldErrors({ 'shippingAddress.phone': 'Invalid phone number', 'shippingAddress.city': 'Required' })).toEqual({ phone: 'Invalid phone number', city: 'Required' })
    expect(checkoutFieldErrors()).toEqual({})
  })
})

describe('order requests', () => {
  it('place an order and return the orders created (one per brand)', async () => {
    api.post.mockResolvedValue({ data: { orders: [{ _id: 'o1' }, { _id: 'o2' }] } })
    expect(await placeOrder(good)).toEqual([{ _id: 'o1' }, { _id: 'o2' }])
    expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ paymentMethod: 'COD' }))
  })

  it('list my orders a page at a time', async () => {
    api.get.mockResolvedValue({ data: { orders: [{ _id: 'o1' }], pagination: { page: 2, pages: 3, total: 25 } } })
    expect(await fetchMyOrders(2)).toEqual({ items: [{ _id: 'o1' }], pagination: { page: 2, pages: 3, total: 25 } })
    expect(api.get).toHaveBeenCalledWith('/orders/my', { params: { page: 2, limit: 10 } })
    api.get.mockResolvedValue({ data: {} })
    expect((await fetchMyOrders()).items).toEqual([])
  })

  it('read one order with its payment and delivery, and cancel it', async () => {
    api.get.mockResolvedValue({ data: { order: { _id: 'o1' }, payment: { status: 'PENDING' }, delivery: null } })
    expect(await fetchOrder('o1')).toEqual({ order: { _id: 'o1' }, payment: { status: 'PENDING' }, delivery: null })
    api.patch.mockResolvedValue({ data: { order: { _id: 'o1', orderStatus: 'CANCELLED' } } })
    expect((await cancelOrder('o1')).orderStatus).toBe('CANCELLED')
    expect(api.patch).toHaveBeenCalledWith('/orders/o1/cancel')
  })
})

describe('order progress', () => {
  const at = '2026-10-04T10:00:00Z'

  it('takes the furthest stage reached, from the history or the current status', () => {
    expect(currentStage([], 'PENDING')).toBe(0)
    expect(currentStage([{ status: 'PENDING' }, { status: 'CONFIRMED' }], 'CONFIRMED')).toBe(1)
    expect(currentStage([], 'READY_FOR_SHIPMENT')).toBe(2) // shown as Processing
    expect(currentStage([{ status: 'SHIPPED' }], 'CONFIRMED')).toBe(3) // history wins when it is further
    expect(currentStage(undefined, 'DELIVERED')).toBe(5)
    expect(currentStage([], 'SOMETHING_ELSE')).toBe(0)
  })

  it('marks each stage done, current or ahead, with the time it was reached', () => {
    const rows = stageRows([{ status: 'PENDING', at }, { status: 'CONFIRMED', at }], 'CONFIRMED')
    expect(rows.map((r) => r.state)).toEqual(['done', 'current', 'ahead', 'ahead', 'ahead', 'ahead'])
    expect(rows.map((r) => r.label)).toEqual(['Placed', 'Confirmed', 'Processing', 'Shipped', 'Out for delivery', 'Delivered'])
    expect(rows[0].at).toBe(at)
    expect(rows[2].at).toBeNull()
  })

  it('shows a delivered order as done, with the last stage current', () => {
    expect(stageRows([], 'DELIVERED').map((r) => r.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'current'])
  })

  it('lets only a pending order be cancelled', () => {
    expect(canCancel({ orderStatus: 'PENDING' })).toBe(true)
    for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REJECTED']) expect(canCancel({ orderStatus: status })).toBe(false)
    expect(canCancel(undefined)).toBe(false)
  })
})

describe('placed orders (for the confirmation screen)', () => {
  it('are held in memory and replaced each time', () => {
    rememberPlacedOrders([{ _id: 'o1' }])
    expect(takePlacedOrders()).toEqual([{ _id: 'o1' }])
    rememberPlacedOrders([{ _id: 'o2' }, { _id: 'o3' }])
    expect(takePlacedOrders()).toHaveLength(2)
    rememberPlacedOrders('junk')
    expect(takePlacedOrders()).toEqual([])
  })
})

describe('formatDateTime', () => {
  it('shows a date and time, and copes with a bad one', () => {
    expect(formatDateTime('2026-10-04T10:00:00Z')).toMatch(/2026/)
    expect(formatDateTime('nope')).toBe('')
    expect(formatDateTime(undefined)).toBe('')
  })
})
