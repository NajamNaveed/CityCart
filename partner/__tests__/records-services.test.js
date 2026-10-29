jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }))

import api from '../src/services/api'
import {
  assignRider, decideProof, fetchActiveRiders, fetchCashCollectors, fetchCollectorCash, fetchOrder, fetchOrders, fetchOverview,
  fetchProofLink, fetchProofQueue, fetchReceipt, fetchReceipts, fetchShipment, fetchShipments, onTheRoad, ORDER_FILTERS,
  SHIPMENT_FILTERS, settleCash,
} from '../src/services/records'

beforeEach(() => jest.clearAllMocks())

describe('orders and deliveries', () => {
  it('ask the brand endpoints, with the filter only when one is chosen', async () => {
    api.get.mockResolvedValue({ data: { orders: [{ _id: 'o1' }], pagination: { page: 1, pages: 1 } } })
    expect(await fetchOrders(undefined, 1)).toEqual({ items: [{ _id: 'o1' }], pagination: { page: 1, pages: 1 } })
    expect(api.get).toHaveBeenLastCalledWith('/brand/orders', { params: { page: 1, limit: 20 } })
    await fetchOrders('DELIVERED', 2)
    expect(api.get).toHaveBeenLastCalledWith('/brand/orders', { params: { status: 'DELIVERED', page: 2, limit: 20 } })

    api.get.mockResolvedValue({ data: { deliveries: [{ _id: 'd1' }], pagination: { page: 1, pages: 1 } } })
    expect((await fetchShipments('FAILED', 1)).items).toEqual([{ _id: 'd1' }])
    expect(api.get).toHaveBeenLastCalledWith('/deliveries', { params: { status: 'FAILED', page: 1, limit: 20 } })
  })

  it('load one order with its payment and delivery, and one delivery', async () => {
    api.get.mockResolvedValue({ data: { order: { _id: 'o1' }, payment: { status: 'PENDING' }, delivery: { _id: 'd1' } } })
    expect(await fetchOrder('o1')).toEqual({
      order: { _id: 'o1' },
      payment: { status: 'PENDING' },
      delivery: { _id: 'd1' },
      adjustments: [],
      adjustment: null,
    })
    expect(api.get).toHaveBeenLastCalledWith('/brand/orders/o1')
    api.get.mockResolvedValue({ data: { delivery: { _id: 'd1' } } })
    expect(await fetchShipment('d1')).toEqual({ _id: 'd1' })
    expect(api.get).toHaveBeenLastCalledWith('/deliveries/d1')
  })

  it('filters offer only statuses the server knows', () => {
    const orderStatuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REJECTED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED']
    const deliveryStatuses = ['READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED']
    ORDER_FILTERS.filter(([s]) => s).forEach(([s]) => expect(orderStatuses).toContain(s))
    SHIPMENT_FILTERS.filter(([s]) => s).forEach(([s]) => expect(deliveryStatuses).toContain(s))
    expect(ORDER_FILTERS[0]).toEqual([undefined, 'All'])
  })
})

describe('riders', () => {
  it('lists the active ones, and assigns or removes one', async () => {
    api.get.mockResolvedValue({ data: { riders: [{ _id: 'r1' }] } })
    expect(await fetchActiveRiders()).toEqual([{ _id: 'r1' }])
    expect(api.get).toHaveBeenLastCalledWith('/riders', { params: { isActive: true, limit: 50 } })

    api.patch.mockResolvedValue({ data: { delivery: { _id: 'd1', riderId: 'r1' } } })
    expect(await assignRider('d1', 'r1')).toEqual({ _id: 'd1', riderId: 'r1' })
    expect(api.patch).toHaveBeenLastCalledWith('/deliveries/d1/rider', { riderId: 'r1' })
    await assignRider('d1', null)
    expect(api.patch).toHaveBeenLastCalledWith('/deliveries/d1/rider', { riderId: null })
  })
})

describe('receipts and cash', () => {
  it('reads receipts', async () => {
    api.get.mockResolvedValue({ data: { receipts: [{ _id: 'x' }], pagination: { page: 1, pages: 1 } } })
    expect((await fetchReceipts(3)).items).toEqual([{ _id: 'x' }])
    expect(api.get).toHaveBeenLastCalledWith('/receipts', { params: { page: 3, limit: 20 } })
    api.get.mockResolvedValue({ data: { receipt: { _id: 'x' } } })
    expect(await fetchReceipt('x')).toEqual({ _id: 'x' })
    expect(api.get).toHaveBeenLastCalledWith('/receipts/x')
  })

  it('reads who holds cash, one holder in detail, and settles exactly the chosen payments', async () => {
    api.get.mockResolvedValue({ data: { collectors: [{ collectorId: 'c1', total: 100 }] } })
    expect(await fetchCashCollectors()).toEqual([{ collectorId: 'c1', total: 100 }])
    expect(api.get).toHaveBeenLastCalledWith('/payments/cash/outstanding')

    api.get.mockResolvedValue({ data: { payments: [{ paymentId: 'p1' }], total: 100 } })
    expect(await fetchCollectorCash('c1')).toEqual({ payments: [{ paymentId: 'p1' }], total: 100 })
    expect(api.get).toHaveBeenLastCalledWith('/payments/cash/outstanding', { params: { collectorId: 'c1' } })

    api.post.mockResolvedValue({ data: { settled: 2, total: 3350 } })
    expect(await settleCash('c1', ['p1', 'p2'])).toEqual({ settled: 2, total: 3350 })
    expect(api.post).toHaveBeenLastCalledWith('/payments/cash/settle', { collectorId: 'c1', paymentIds: ['p1', 'p2'] })
  })
})

describe('payment proofs to verify', () => {
  it('reads the queue with its own page of unverified proofs', async () => {
    api.get.mockResolvedValue({ data: { proofs: [{ paymentId: 'p1' }], pagination: { page: 2, pages: 4 } } })
    expect(await fetchProofQueue('SUBMITTED', 2)).toEqual({ items: [{ paymentId: 'p1' }], pagination: { page: 2, pages: 4 } })
    expect(api.get).toHaveBeenLastCalledWith('/payments/proofs', { params: { status: 'SUBMITTED', page: 2, limit: 20 } })
  })

  it('asks for a short-lived photo link, and sends a decision with a reason only when rejecting', async () => {
    api.get.mockResolvedValue({ data: { proof: { paymentId: 'p1', url: 'https://example.test/photo' } } })
    expect(await fetchProofLink('p1')).toEqual({ paymentId: 'p1', url: 'https://example.test/photo' })
    expect(api.get).toHaveBeenLastCalledWith('/payments/p1/proof')

    api.patch.mockResolvedValue({ data: { proof: { paymentId: 'p1', verification: 'VERIFIED' } } })
    expect(await decideProof('p1', 'VERIFIED')).toEqual({ paymentId: 'p1', verification: 'VERIFIED' })
    expect(api.patch).toHaveBeenLastCalledWith('/payments/p1/proof', { verification: 'VERIFIED' })

    await decideProof('p1', 'REJECTED', 'Not on the statement')
    expect(api.patch).toHaveBeenLastCalledWith('/payments/p1/proof', { verification: 'REJECTED', note: 'Not on the statement' })
  })
})

describe('the overview', () => {
  it('asks only for what the person may see', async () => {
    expect(await fetchOverview({ deliveries: false, money: false })).toEqual({ counts: null, cash: null })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('counts deliveries by status with one small request each, and totals the cash', async () => {
    api.get.mockImplementation(async (url, config) => {
      if (url === '/deliveries') return { data: { pagination: { total: { READY_FOR_PICKUP: 4, PICKED_UP: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, FAILED: 5, DELIVERED: 40 }[config.params.status] } } }
      return { data: { collectors: [{ total: 1000 }, { total: 250 }] } }
    })
    const { counts, cash } = await fetchOverview({ deliveries: true, money: true })
    expect(counts).toEqual({ READY_FOR_PICKUP: 4, PICKED_UP: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, FAILED: 5, DELIVERED: 40 })
    expect(cash).toEqual({ total: 1250, holders: 2 })
    expect(api.get).toHaveBeenCalledWith('/deliveries', { params: { status: 'FAILED', page: 1, limit: 1 } })
    expect(onTheRoad(counts)).toBe(6)
    expect(onTheRoad(null)).toBe(0)
  })

  it('a part that fails comes back empty instead of failing the whole screen', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/deliveries') throw new Error('Network Error')
      return { data: { collectors: [] } }
    })
    expect(await fetchOverview({ deliveries: true, money: true })).toEqual({ counts: null, cash: { total: 0, holders: 0 } })
  })
})
