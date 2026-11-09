jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }))

import api from '../src/services/api'
import {
  SORT_OPTIONS,
  createServiceBooking,
  discoverServices,
  fetchServiceCategories,
  fetchServiceProvider,
  serviceDiscoverQuery,
} from '../src/services/services'
import {
  fetchProviderMessages,
  markProviderChatRead,
  sendProviderMessage,
  startProviderChat,
} from '../src/services/providerChats'

beforeEach(() => jest.clearAllMocks())

const ORIGIN = { lat: 31.4186, lng: 73.079 }

describe('serviceDiscoverQuery', () => {
  it('asks for nothing without a city', () => {
    expect(serviceDiscoverQuery({ cityId: '' })).toBeNull()
  })

  it('searches the whole city when no area is chosen', () => {
    expect(serviceDiscoverQuery({ cityId: 'c1' })).toEqual({
      page: 1,
      limit: 12,
      sort: 'rank',
      cityId: 'c1',
      scope: 'city',
    })
  })

  it('searches the chosen blocks and measures a radius from their centre', () => {
    expect(serviceDiscoverQuery({ cityId: 'c1', blockIds: ['b1', 'b2'], origin: ORIGIN, range: 'block' })).toMatchObject({
      scope: 'area',
      blockIds: 'b1,b2',
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
    })
    expect(serviceDiscoverQuery({ cityId: 'c1', blockIds: ['b1'], origin: ORIGIN, range: '5' })).toMatchObject({
      scope: 'area',
      radiusKm: '5',
    })
  })

  it('widens to the city when the shopper chooses it', () => {
    expect(serviceDiscoverQuery({ cityId: 'c1', blockIds: ['b1'], origin: ORIGIN, range: 'city' })).toMatchObject({
      scope: 'city',
      cityId: 'c1',
    })
  })

  it('uses a radius around the shopper when no block is chosen', () => {
    expect(serviceDiscoverQuery({ cityId: 'c1', coords: ORIGIN, range: '5' })).toEqual({
      page: 1,
      limit: 12,
      sort: 'rank',
      scope: 'radius',
      radiusKm: '5',
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
    })
    // Without a position there is nothing to measure from, so the city is searched.
    expect(serviceDiscoverQuery({ cityId: 'c1', range: '5' })).toMatchObject({ scope: 'city', cityId: 'c1' })
  })

  it('carries the search, category, sort and page', () => {
    expect(
      serviceDiscoverQuery({ cityId: 'c1', q: '  plumber ', categoryId: 'cat1', sort: 'price', page: 3 }),
    ).toMatchObject({ q: 'plumber', categoryId: 'cat1', sort: 'price', page: 3 })
  })
})

describe('services API', () => {
  it('offers the three server sorts', () => {
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual(['rank', 'rating', 'price'])
  })

  it('treats a missing category list as empty', async () => {
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchServiceCategories()).toEqual([])
    expect(api.get).toHaveBeenCalledWith('/services/categories')
  })

  it('shapes a discovery answer and tolerates a sparse one', async () => {
    api.get.mockResolvedValue({ data: { items: [{ _id: 'p1' }], pagination: { total: 1 }, meta: { totalOfferings: 2 } } })
    expect(await discoverServices({ cityId: 'c1' })).toMatchObject({
      items: [{ _id: 'p1' }],
      pagination: { total: 1 },
      meta: { totalOfferings: 2 },
    })
    api.get.mockResolvedValue({ data: {} })
    expect(await discoverServices({ cityId: 'c1' })).toEqual({
      items: [],
      pagination: { page: 1, pages: 0, total: 0 },
      meta: {},
    })
  })

  it('loads the public provider page by slug', async () => {
    api.get.mockResolvedValue({ data: { provider: { slug: 'ali-plumbing' } } })
    expect(await fetchServiceProvider('ali-plumbing')).toEqual({ slug: 'ali-plumbing' })
    expect(api.get).toHaveBeenCalledWith('/services/providers/ali-plumbing')
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchServiceProvider('gone')).toBeNull()
  })

  it('posts a booking request and returns the created booking', async () => {
    api.post.mockResolvedValue({ data: { booking: { _id: 'bk1', bookingNumber: 'SRV-1' } } })
    const body = { providerId: 'p1', offeringId: 'o1', scheduledStart: '2026-11-10T04:00:00.000Z' }
    expect(await createServiceBooking(body)).toEqual({ _id: 'bk1', bookingNumber: 'SRV-1' })
    expect(api.post).toHaveBeenCalledWith('/services/bookings', body)
  })
})

describe('direct provider chat', () => {
  it('opens a thread with one provider', async () => {
    api.post.mockResolvedValue({ data: { conversationId: 'c1', provider: { name: 'Ali' } } })
    expect(await startProviderChat('p1')).toEqual({ conversationId: 'c1', provider: { name: 'Ali' } })
    expect(api.post).toHaveBeenCalledWith('/services/direct-chats/start', { providerId: 'p1' })
  })

  it('reads a page of messages, optionally before an older one', async () => {
    api.get.mockResolvedValue({ data: { messages: [{ _id: 'm1' }], hasMore: true } })
    expect(await fetchProviderMessages('c1')).toEqual({ messages: [{ _id: 'm1' }], hasMore: true })
    expect(api.get).toHaveBeenCalledWith('/services/direct-chats/c1/messages', {
      params: { limit: 30 },
    })
    await fetchProviderMessages('c1', { before: 'm9' })
    expect(api.get).toHaveBeenLastCalledWith('/services/direct-chats/c1/messages', {
      params: { limit: 30, before: 'm9' },
    })
  })

  it('sends a message and marks the thread read', async () => {
    api.post.mockResolvedValueOnce({ data: { message: { _id: 'm2', body: 'Hello' } } })
    expect(await sendProviderMessage('c1', 'Hello')).toEqual({ _id: 'm2', body: 'Hello' })
    expect(api.post).toHaveBeenCalledWith('/services/direct-chats/c1/messages', { body: 'Hello' })
    api.post.mockResolvedValueOnce({ data: { success: true } })
    await markProviderChatRead('c1')
    expect(api.post).toHaveBeenLastCalledWith('/services/direct-chats/c1/read')
  })
})
