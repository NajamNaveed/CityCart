jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))
jest.mock('../src/services/location', () => ({ getShopperPosition: jest.fn() }))

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import { browseQuery, discoverQuery, fetchBlocks, fetchCatalogBrowse, fetchDiscover, locateShopper, needsArea, normalizeStored, resolveAt } from '../src/services/nearby'

beforeEach(() => jest.clearAllMocks())

describe('normalizeStored (what was remembered)', () => {
  it('reads a good saved value', () => {
    expect(normalizeStored({ blockIds: ['b1', 'b2'], coords: { lat: 31.4, lng: 73.1 }, pinned: true, range: '5' })).toEqual({
      blockIds: ['b1', 'b2'],
      coords: { lat: 31.4, lng: 73.1 },
      pinned: true,
      range: '5',
    })
  })

  it('still reads what an older version saved (one block)', () => {
    expect(normalizeStored({ blockId: 'b1', coords: null, range: 'block' })).toEqual({ blockIds: ['b1'], coords: null, pinned: false, range: 'block' })
  })

  it('survives damaged or missing values', () => {
    const empty = { blockIds: [], coords: null, pinned: false, range: 'block' }
    for (const bad of [null, undefined, 'text', 42, [], {}]) expect(normalizeStored(bad)).toEqual(empty)
    expect(normalizeStored({ blockIds: [7, '', null], coords: { lat: 'x', lng: 2 }, pinned: 'yes', range: '999' })).toEqual(empty)
  })

  it('keeps at most ten blocks', () => {
    const many = Array.from({ length: 14 }, (_, i) => `b${i}`)
    expect(normalizeStored({ blockIds: many }).blockIds).toHaveLength(10)
  })
})

describe('discoverQuery', () => {
  const here = { lat: 31.4, lng: 73.1 }
  const area = { cityId: 'c1', blockIds: ['b1', 'b2'], coords: here }

  it('has nothing to ask without a city', () => {
    expect(discoverQuery({ cityId: '', blockIds: ['b1'] })).toBeNull()
  })

  it('searches the chosen blocks, measuring from where the shopper is', () => {
    expect(discoverQuery({ ...area, range: 'block' })).toEqual({ scope: 'area', blockIds: 'b1,b2', lat: 31.4, lng: 73.1, page: 1, limit: 10 })
  })

  it('adds the range around the shopper inside the blocks', () => {
    expect(discoverQuery({ ...area, range: '5' })).toMatchObject({ scope: 'area', blockIds: 'b1,b2', radiusKm: '5', lat: 31.4, lng: 73.1 })
  })

  it('measures from the block centre (the origin) when there is no position, and has no range without one', () => {
    const fromBlock = discoverQuery({ cityId: 'c1', blockIds: ['b1'], coords: null, origin: { lat: 31.5, lng: 73.2 }, range: '10' })
    expect(fromBlock).toMatchObject({ scope: 'area', radiusKm: '10', lat: 31.5, lng: 73.2 })
    const noOrigin = discoverQuery({ cityId: 'c1', blockIds: ['b1', 'b2'], coords: null, range: '10' })
    expect(noOrigin).toMatchObject({ scope: 'area', blockIds: 'b1,b2' })
    expect(noOrigin).not.toHaveProperty('radiusKm')
    expect(noOrigin).not.toHaveProperty('lat')
  })

  it('searches a range around the shopper when they are between blocks', () => {
    expect(discoverQuery({ cityId: 'c1', blockIds: [], coords: here, range: '5' })).toMatchObject({ scope: 'radius', radiusKm: '5', cityId: 'c1', lat: 31.4 })
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
    expect(discoverQuery({ cityId: 'c1' })).not.toHaveProperty('blockIds')
  })
})

describe('needsArea (the "choose your area" notice)', () => {
  it('is true when the range needs a place the shopper has not given', () => {
    expect(needsArea({ range: 'block', blockIds: [], coords: null })).toBe(true)
    expect(needsArea({ range: '5', blockIds: [], coords: null })).toBe(true)
  })
  it('is false otherwise', () => {
    expect(needsArea({ range: 'block', blockIds: ['b1'], coords: null })).toBe(false)
    expect(needsArea({ range: '5', blockIds: [], coords: { lat: 1, lng: 2 } })).toBe(false)
    expect(needsArea({ range: 'city', blockIds: [], coords: null })).toBe(false)
  })
})

describe('browseQuery (products in the area)', () => {
  const origin = { lat: 31.4, lng: 73.1 }

  it('needs an area, and is not for the whole-city range', () => {
    expect(browseQuery({ blockIds: [] })).toBeNull()
    expect(browseQuery({ blockIds: ['b1'], range: 'city' })).toBeNull()
  })

  it('asks for the chosen blocks, sorted by name unless told otherwise', () => {
    expect(browseQuery({ blockIds: ['b1', 'b2'] })).toEqual({ blockIds: 'b1,b2', sort: 'name', page: 1, limit: 12 })
  })

  it('adds the position and range, and the search text trimmed', () => {
    expect(browseQuery({ blockIds: ['b1'], origin, range: '5', q: ' ghee ' })).toMatchObject({ lat: 31.4, lng: 73.1, radiusKm: '5', q: 'ghee' })
    expect(browseQuery({ blockIds: ['b1'], origin, range: 'block' })).not.toHaveProperty('radiusKm')
  })

  it('sorts by distance only when there is somewhere to measure from', () => {
    expect(browseQuery({ blockIds: ['b1'], origin, sort: 'nearest' }).sort).toBe('nearest')
    expect(browseQuery({ blockIds: ['b1'], sort: 'nearest' }).sort).toBe('name')
    expect(browseQuery({ blockIds: ['b1'], sort: 'price' }).sort).toBe('price')
    expect(browseQuery({ blockIds: ['b1'], sort: 'bogus' }).sort).toBe('name')
  })
})

describe('fetchers', () => {
  it('fetchDiscover returns the brands, the paging and the search details', async () => {
    api.get.mockResolvedValue({ data: { items: [{ _id: 'b1' }], pagination: { page: 1, pages: 2, total: 12 }, meta: { origin: { lat: 1, lng: 2 }, radiusKm: 5 } } })
    const result = await fetchDiscover({ cityId: 'c1', scope: 'city' })
    expect(api.get).toHaveBeenCalledWith('/discover', { params: { cityId: 'c1', scope: 'city' } })
    expect(result).toEqual({ items: [{ _id: 'b1' }], pagination: { page: 1, pages: 2, total: 12 }, meta: { origin: { lat: 1, lng: 2 }, radiusKm: 5 } })
  })

  it('fetchCatalogBrowse returns the products with their offers', async () => {
    api.get.mockResolvedValue({ data: { items: [{ catalogProductId: 'p1', offers: [] }], pagination: { page: 1, pages: 1, total: 1 }, meta: { blocks: [] } } })
    const result = await fetchCatalogBrowse({ blockIds: 'b1', sort: 'name' })
    expect(api.get).toHaveBeenCalledWith('/catalog/browse', { params: { blockIds: 'b1', sort: 'name' } })
    expect(result.items).toEqual([{ catalogProductId: 'p1', offers: [] }])
    api.get.mockResolvedValue({ data: {} })
    expect((await fetchCatalogBrowse({})).items).toEqual([])
  })

  it('fetchBlocks asks for the active blocks of one city, and copes with odd answers', async () => {
    api.get.mockResolvedValue({ data: { blocks: [{ _id: 'b1', name: 'Gulberg' }] } })
    expect(await fetchBlocks('c1')).toEqual([{ _id: 'b1', name: 'Gulberg' }])
    expect(api.get).toHaveBeenCalledWith('/blocks', { params: { cityId: 'c1', isActive: true } })
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchBlocks('c1')).toEqual([])
  })
})

describe('resolveAt (which blocks is this position in?)', () => {
  const coords = { lat: 31.4, lng: 73.1 }
  const gulberg = { _id: 'b1', name: 'Gulberg', cityId: 'c1' }
  const dGround = { _id: 'b2', name: 'D Ground', cityId: 'c1' }

  it('is "found" inside one block', async () => {
    api.get.mockResolvedValue({ data: { containing: [gulberg], nearest: [dGround] } })
    const result = await resolveAt(coords)
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: coords })
    expect(result).toEqual({ status: 'found', containing: [gulberg], nearest: [dGround], coords })
  })

  it('is "overlap" inside several blocks', async () => {
    api.get.mockResolvedValue({ data: { containing: [gulberg, dGround], nearest: [] } })
    expect((await resolveAt(coords)).status).toBe('overlap')
  })

  it('is "border" between blocks, offering the nearest ones', async () => {
    api.get.mockResolvedValue({ data: { containing: [], nearest: [gulberg, dGround] } })
    expect(await resolveAt(coords)).toEqual({ status: 'border', containing: [], nearest: [gulberg, dGround], coords })
  })

  it('is "outside" when no block is anywhere near, and "error" when the server cannot be reached', async () => {
    api.get.mockResolvedValue({ data: { containing: [], nearest: [] } })
    expect(await resolveAt(coords)).toEqual({ status: 'outside' })
    api.get.mockResolvedValue({ data: {} })
    expect(await resolveAt(coords)).toEqual({ status: 'outside' })
    api.get.mockRejectedValue(new Error('Network Error'))
    expect((await resolveAt(coords)).status).toBe('error')
  })
})

describe('locateShopper', () => {
  it("finds the shopper's blocks from their position", async () => {
    getShopperPosition.mockResolvedValue({ lat: 31.4, lng: 73.1 })
    api.get.mockResolvedValue({ data: { containing: [{ _id: 'b1', name: 'Gulberg', cityId: 'c1' }], nearest: [] } })
    const result = await locateShopper()
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: { lat: 31.4, lng: 73.1 } })
    expect(result).toMatchObject({ status: 'found', coords: { lat: 31.4, lng: 73.1 } })
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
})
