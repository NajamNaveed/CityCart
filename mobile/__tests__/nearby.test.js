jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))
jest.mock('../src/services/location', () => ({ getShopperPosition: jest.fn() }))

import api from '../src/services/api'
import { getShopperPosition } from '../src/services/location'
import { areaParams, discoverQuery, fetchBlocks, fetchDiscover, locateShopper, needsArea, normalizeStored, resolvePoint } from '../src/services/nearby'

beforeEach(() => jest.clearAllMocks())

const POSITION = { lat: 31.4, lng: 73.1 }
const EMPTY = { blockIds: [], coords: null, pinned: false, range: 'block' }

describe('normalizeStored (what was remembered)', () => {
  it('reads a good saved value', () => {
    expect(normalizeStored({ blockIds: ['b1'], coords: POSITION, pinned: true, range: '20' })).toEqual({ blockIds: ['b1'], coords: POSITION, pinned: true, range: '20' })
  })

  it('brings an older single-block value forward', () => {
    expect(normalizeStored({ blockId: 'b1', coords: POSITION, range: '5' })).toEqual({ blockIds: ['b1'], coords: POSITION, pinned: false, range: '5' })
  })

  it('keeps at most ten blocks, and drops anything that is not a block id', () => {
    expect(normalizeStored({ blockIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] }).blockIds).toHaveLength(10)
    expect(normalizeStored({ blockIds: ['a', 7, '', null] }).blockIds).toEqual(['a'])
  })

  it('survives damaged or missing values', () => {
    for (const bad of [null, undefined, 'text', 42, [], {}, { blockId: 7, coords: { lat: 'x', lng: 2 }, range: '999' }]) expect(normalizeStored(bad)).toEqual(EMPTY)
  })
})

describe('discoverQuery', () => {
  it('has nothing to ask without a city', () => {
    expect(discoverQuery({ cityId: '', blockIds: ['b1'] })).toBeNull()
  })

  it('searches the chosen blocks, measuring from where the shopper is', () => {
    expect(discoverQuery({ cityId: 'c1', blockIds: ['b1'], coords: POSITION, range: 'block' })).toEqual({
      page: 1,
      limit: 10,
      scope: 'area',
      blockIds: 'b1',
      cityId: 'c1',
      lat: 31.4,
      lng: 73.1,
    })
  })

  it('takes every block in an overlap', () => {
    const query = discoverQuery({ cityId: 'c1', blockIds: ['b1', 'b2'], coords: POSITION, range: 'block' })
    expect(query.blockIds).toBe('b1,b2')
  })

  it('works from the blocks alone when they were picked by hand', () => {
    const query = discoverQuery({ cityId: 'c1', blockIds: ['b1'], coords: null, range: 'block' })
    expect(query).toMatchObject({ scope: 'area', blockIds: 'b1' })
    expect(query).not.toHaveProperty('lat')
    expect(query).not.toHaveProperty('lng')
  })

  it('adds the radius only when there is a position to measure from', () => {
    expect(discoverQuery({ cityId: 'c1', blockIds: ['b1'], coords: POSITION, range: '7.5' })).toMatchObject({ scope: 'area', radiusKm: '7.5' })
    expect(discoverQuery({ cityId: 'c1', blockIds: ['b1'], coords: null, range: '7.5' })).not.toHaveProperty('radiusKm')
  })

  it('searches a radius around the shopper when no block holds them', () => {
    expect(discoverQuery({ cityId: 'c1', blockIds: [], coords: POSITION, range: '5' })).toEqual({
      page: 1,
      limit: 10,
      scope: 'radius',
      cityId: 'c1',
      radiusKm: '5',
      lat: 31.4,
      lng: 73.1,
    })
  })

  it('covers the whole city when asked, or when there is nothing to measure from', () => {
    expect(discoverQuery({ cityId: 'c1', blockIds: ['b1'], coords: POSITION, range: 'city' }).scope).toBe('city')
    expect(discoverQuery({ cityId: 'c1', blockIds: [], coords: null, range: 'block' }).scope).toBe('city')
    expect(discoverQuery({ cityId: 'c1', blockIds: [], coords: null, range: '5' }).scope).toBe('city')
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
    expect(needsArea({ range: '5', blockIds: [], coords: POSITION })).toBe(false)
    expect(needsArea({ range: 'city', blockIds: [], coords: null })).toBe(false)
  })
})

describe('areaParams (for the product offers list)', () => {
  it('needs at least one block', () => {
    expect(areaParams({ blockIds: [], coords: POSITION, range: '5' })).toBeNull()
  })

  it('sends the blocks, and a radius only when one is chosen', () => {
    expect(areaParams({ blockIds: ['b1', 'b2'], coords: POSITION, range: '5' })).toEqual({ blockIds: 'b1,b2', lat: 31.4, lng: 73.1, radiusKm: '5' })
    expect(areaParams({ blockIds: ['b1'], coords: null, range: 'block' })).toEqual({ blockIds: 'b1' })
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

describe('resolvePoint', () => {
  it('asks which blocks hold a spot and returns the blocks and the nearest others', async () => {
    const containing = [{ _id: 'b1', name: 'Gulberg' }]
    const nearest = [{ _id: 'b2', name: 'D Ground', distanceKm: 0.4 }]
    api.get.mockResolvedValue({ data: { containing, nearest } })
    expect(await resolvePoint(POSITION)).toEqual({ containing, nearest })
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: POSITION })
  })

  it('copes with an answer that has no lists', async () => {
    api.get.mockResolvedValue({ data: {} })
    expect(await resolvePoint(POSITION)).toEqual({ containing: [], nearest: [] })
  })
})

describe('locateShopper', () => {
  it('finds the single block holding the shopper', async () => {
    const containing = [{ _id: 'b1', name: 'Gulberg' }]
    getShopperPosition.mockResolvedValue(POSITION)
    api.get.mockResolvedValue({ data: { containing, nearest: [] } })
    expect(await locateShopper()).toEqual({ status: 'found', coords: POSITION, containing, nearest: [] })
    expect(api.get).toHaveBeenCalledWith('/blocks/at', { params: POSITION })
  })

  it('reports an overlap when several blocks hold the shopper', async () => {
    const containing = [{ _id: 'b1' }, { _id: 'b2' }]
    getShopperPosition.mockResolvedValue(POSITION)
    api.get.mockResolvedValue({ data: { containing, nearest: [] } })
    expect((await locateShopper()).status).toBe('overlap')
  })

  it('reports a border spot, offering the nearest blocks', async () => {
    const nearest = [{ _id: 'b2', distanceKm: 0.4 }]
    getShopperPosition.mockResolvedValue(POSITION)
    api.get.mockResolvedValue({ data: { containing: [], nearest } })
    const result = await locateShopper()
    expect(result.status).toBe('border')
    expect(result.nearest).toEqual(nearest)
  })

  it('says "outside" when the shopper is somewhere we do not serve', async () => {
    getShopperPosition.mockResolvedValue({ lat: 10, lng: 10 })
    api.get.mockResolvedValue({ data: { containing: [], nearest: [] } })
    expect(await locateShopper()).toEqual({ status: 'outside', coords: { lat: 10, lng: 10 }, containing: [], nearest: [] })
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
    getShopperPosition.mockResolvedValue(POSITION)
    api.get.mockRejectedValue(new Error('Network Error'))
    const result = await locateShopper()
    expect(result.status).toBe('error')
    expect(result.coords).toEqual(POSITION)
  })
})
