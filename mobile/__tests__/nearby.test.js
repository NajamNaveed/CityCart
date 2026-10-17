jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))
jest.mock('../src/services/location', () => ({ getShopperPosition: jest.fn() }))

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import { discoverQuery, fetchBlocks, fetchDiscover, locateShopper, needsArea, normalizeStored } from '../src/services/nearby'

beforeEach(() => jest.clearAllMocks())

describe('normalizeStored (what was remembered)', () => {
  it('reads a good saved value', () => {
    expect(normalizeStored({ blockId: 'b1', coords: { lat: 31.4, lng: 73.1 }, range: '5' })).toEqual({ blockId: 'b1', coords: { lat: 31.4, lng: 73.1 }, range: '5' })
  })

  it('survives damaged or missing values', () => {
    const empty = { blockId: '', coords: null, range: 'block' }
    for (const bad of [null, undefined, 'text', 42, [], {}]) expect(normalizeStored(bad)).toEqual(empty)
    expect(normalizeStored({ blockId: 7, coords: { lat: 'x', lng: 2 }, range: '999' })).toEqual(empty)
  })
})

describe('discoverQuery', () => {
  const area = { cityId: 'c1', blockId: 'b1', coords: { lat: 31.4, lng: 73.1 } }

  it('has nothing to ask without a city', () => {
    expect(discoverQuery({ cityId: '', blockId: 'b1' })).toBeNull()
  })

  it('searches the block, measuring from where the shopper is', () => {
    expect(discoverQuery({ ...area, range: 'block' })).toMatchObject({ scope: 'block', blockId: 'b1', cityId: 'c1', lat: 31.4, lng: 73.1, page: 1, limit: 10 })
  })

  it('searches a radius from the position, or from the block when there is no position', () => {
    expect(discoverQuery({ ...area, range: '5' })).toMatchObject({ scope: 'radius', radiusKm: '5', lat: 31.4 })
    const manual = discoverQuery({ cityId: 'c1', blockId: 'b1', coords: null, range: '10' })
    expect(manual).toMatchObject({ scope: 'radius', radiusKm: '10', blockId: 'b1' })
    expect(manual).not.toHaveProperty('lat')
  })

  it('covers the whole city when asked, or when there is nothing to measure from', () => {
    expect(discoverQuery({ ...area, range: 'city' }).scope).toBe('city')
    expect(discoverQuery({ cityId: 'c1', range: 'block' }).scope).toBe('city')
    expect(discoverQuery({ cityId: 'c1', range: '5' }).scope).toBe('city')
  })

  it('trims the search text and adds only what is set', () => {
    const query = discoverQuery({ cityId: 'c1', q: '  kurta ', page: 2 })
    expect(query).toMatchObject({ q: 'kurta', page: 2 })
    expect(discoverQuery({ cityId: 'c1', q: '   ' })).not.toHaveProperty('q')
    expect(discoverQuery({ cityId: 'c1' })).not.toHaveProperty('blockId')
  })
})

describe('needsArea (the "choose your area" notice)', () => {
  it('is true when the range needs a place the shopper has not given', () => {
    expect(needsArea({ range: 'block', blockId: '', coords: null })).toBe(true)
    expect(needsArea({ range: '5', blockId: '', coords: null })).toBe(true)
  })
  it('is false otherwise', () => {
    expect(needsArea({ range: 'block', blockId: 'b1', coords: null })).toBe(false)
    expect(needsArea({ range: '5', blockId: '', coords: { lat: 1, lng: 2 } })).toBe(false)
    expect(needsArea({ range: 'city', blockId: '', coords: null })).toBe(false)
  })
})

describe('fetchers', () => {
  it('fetchDiscover returns the brands, the paging and the search details', async () => {
    api.get.mockResolvedValue({ data: { items: [{ _id: 'b1' }], pagination: { page: 1, pages: 2, total: 12 }, meta: { origin: { lat: 1, lng: 2 }, radiusKm: 5 } } })
    const result = await fetchDiscover({ cityId: 'c1', scope: 'city' })
    expect(api.get).toHaveBeenCalledWith('/discover', { params: { cityId: 'c1', scope: 'city' } })
    expect(result).toEqual({ items: [{ _id: 'b1' }], pagination: { page: 1, pages: 2, total: 12 }, meta: { origin: { lat: 1, lng: 2 }, radiusKm: 5 } })
  })

  it('fetchBlocks asks for the active blocks of one city, and copes with odd answers', async () => {
    api.get.mockResolvedValue({ data: { blocks: [{ _id: 'b1', name: 'Gulberg' }] } })
    expect(await fetchBlocks('c1')).toEqual([{ _id: 'b1', name: 'Gulberg' }])
    expect(api.get).toHaveBeenCalledWith('/blocks', { params: { cityId: 'c1', isActive: true } })
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchBlocks('c1')).toEqual([])
  })
})

describe('locateShopper', () => {
  it('finds the shopper\'s block and city from their position', async () => {
    getShopperPosition.mockResolvedValue({ lat: 31.4, lng: 73.1 })
    api.get.mockResolvedValue({ data: { block: { _id: 'b1', name: 'Gulberg' }, city: { _id: 'c1', name: 'Faisalabad' } } })
    const result = await locateShopper()
    expect(api.get).toHaveBeenCalledWith('/blocks/resolve', { params: { lat: 31.4, lng: 73.1 } })
    expect(result).toEqual({ status: 'found', block: { _id: 'b1', name: 'Gulberg' }, city: { _id: 'c1', name: 'Faisalabad' }, coords: { lat: 31.4, lng: 73.1 } })
  })

  it('says "outside" when the shopper is somewhere we do not serve', async () => {
    getShopperPosition.mockResolvedValue({ lat: 10, lng: 10 })
    api.get.mockResolvedValue({ data: { block: null, city: null } })
    expect(await locateShopper()).toEqual({ status: 'outside' })
  })

  it('names each reason the position could not be found', async () => {
    const fail = (code, canAskAgain) => getShopperPosition.mockRejectedValue(Object.assign(new Error(code), { code, canAskAgain }))
    fail('DENIED', false)
    expect(await locateShopper()).toEqual({ status: 'denied', canAskAgain: false })
    fail('DENIED', true)
    expect(await locateShopper()).toEqual({ status: 'denied', canAskAgain: true })
    fail('SERVICES_OFF')
    expect((await locateShopper()).status).toBe('servicesOff')
    fail('TIMEOUT')
    expect((await locateShopper()).status).toBe('timeout')
    fail('UNAVAILABLE')
    expect((await locateShopper()).status).toBe('error')
    expect(api.get).not.toHaveBeenCalled() // no position, so the server is never asked
  })

  it('reports an error when the server cannot be reached', async () => {
    getShopperPosition.mockResolvedValue({ lat: 31.4, lng: 73.1 })
    api.get.mockRejectedValue(new Error('Network Error'))
    expect((await locateShopper()).status).toBe('error')
  })
})
