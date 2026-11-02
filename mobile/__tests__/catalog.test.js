jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import api from '../src/services/api'
import {
  CATALOG_PAGE_SIZE,
  catalogQuery,
  fetchBrands,
  fetchCatalogBrowse,
  fetchCatalogOffers,
  fetchProduct,
  fetchProducts,
  fetchRatings,
  fetchReviews,
  PAGE_SIZE,
  productQuery,
  SORTS,
} from '../src/services/catalog'

beforeEach(() => jest.clearAllMocks())

describe('productQuery', () => {
  it('defaults to the newest products, a page at a time', () => {
    expect(productQuery()).toEqual({ page: 1, limit: PAGE_SIZE, sort: 'createdAt', order: 'desc' })
  })

  it('adds only the filters that are set, trimming the search text', () => {
    expect(productQuery({ search: '  lawn suit ', brandId: 'b1', cityId: 'c1', page: 3 })).toEqual({
      page: 3,
      limit: PAGE_SIZE,
      sort: 'createdAt',
      order: 'desc',
      search: 'lawn suit',
      brandId: 'b1',
      cityId: 'c1',
    })
    expect(productQuery({ search: '   ' })).not.toHaveProperty('search')
    expect(productQuery({ cityId: '' })).not.toHaveProperty('cityId')
  })

  it('maps every sort choice to the API\'s sort and order, and falls back to newest', () => {
    expect(productQuery({ sortKey: 'price-asc' })).toMatchObject({ sort: 'price', order: 'asc' })
    expect(productQuery({ sortKey: 'price-desc' })).toMatchObject({ sort: 'price', order: 'desc' })
    expect(productQuery({ sortKey: 'name' })).toMatchObject({ sort: 'name', order: 'asc' })
    expect(productQuery({ sortKey: 'bogus' })).toMatchObject({ sort: 'createdAt', order: 'desc' })
    expect(SORTS.map((s) => s.key)).toEqual(['newest', 'price-asc', 'price-desc', 'name'])
  })
})

describe('fetchers', () => {
  it('fetchProducts returns the items and the paging info', async () => {
    api.get.mockResolvedValue({ data: { products: [{ _id: 'p1' }], pagination: { page: 1, pages: 4, total: 40 } } })
    const result = await fetchProducts({ search: 'kurta', cityId: 'c1' })
    expect(api.get).toHaveBeenCalledWith('/products', { params: expect.objectContaining({ search: 'kurta', cityId: 'c1', page: 1 }) })
    expect(result).toEqual({ items: [{ _id: 'p1' }], pagination: { page: 1, pages: 4, total: 40 } })
  })

  it('treats a missing list as empty', async () => {
    api.get.mockResolvedValue({ data: {} })
    expect((await fetchProducts()).items).toEqual([])
    expect(await fetchBrands()).toEqual([])
  })

  it('fetchBrands narrows by city only when one is chosen', async () => {
    api.get.mockResolvedValue({ data: { brands: [{ _id: 'b1' }] } })
    await fetchBrands('c1')
    expect(api.get).toHaveBeenLastCalledWith('/brands', { params: { cityId: 'c1' } })
    await fetchBrands('')
    expect(api.get).toHaveBeenLastCalledWith('/brands', { params: {} })
  })

  it('fetchRatings sends one comma-separated list, and nothing for an empty page', async () => {
    api.get.mockResolvedValue({ data: { ratings: { p1: { average: 4.5, count: 2 } } } })
    expect(await fetchRatings(['p1', 'p2'])).toEqual({ p1: { average: 4.5, count: 2 } })
    expect(api.get).toHaveBeenCalledWith('/reviews/summary', { params: { productIds: 'p1,p2' } })
    api.get.mockClear()
    expect(await fetchRatings([])).toEqual({})
    expect(api.get).not.toHaveBeenCalled()
  })

  it('fetchProduct still works when the brand cannot be loaded', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/products/p1') return { data: { product: { _id: 'p1', brandId: 'b1' } } }
      throw new Error('brand down')
    })
    expect(await fetchProduct('p1')).toEqual({ product: { _id: 'p1', brandId: 'b1' }, brand: null })
  })

  it('fetchProduct includes the brand when available', async () => {
    api.get.mockImplementation(async (url) =>
      url === '/products/p1' ? { data: { product: { _id: 'p1', brandId: 'b1' } } } : { data: { brand: { _id: 'b1', name: 'Loom & Co.' } } },
    )
    expect((await fetchProduct('p1')).brand.name).toBe('Loom & Co.')
  })

  it('fetchReviews asks for five at a time', async () => {
    api.get.mockResolvedValue({ data: { reviews: [{ _id: 'r1' }], summary: { average: 5, count: 1 }, pagination: { page: 2, pages: 2 } } })
    const result = await fetchReviews('p1', 2)
    expect(api.get).toHaveBeenCalledWith('/products/p1/reviews', { params: { limit: 5, page: 2 } })
    expect(result.reviews).toHaveLength(1)
  })
})

describe('the shared catalogue', () => {
  const GULBERG = '64b7f0c2a1b2c3d4e5f60704'
  const DGROUND = '64b7f0c2a1b2c3d4e5f60707'

  it('cannot browse the catalogue without an area', () => {
    expect(catalogQuery({})).toBeNull()
    expect(catalogQuery({ blockIds: [] })).toBeNull()
    expect(catalogQuery({ blockIds: 'not-a-list' })).toBeNull()
  })

  it('asks for the chosen blocks as one comma-separated list, a page at a time', () => {
    expect(catalogQuery({ blockIds: [GULBERG, DGROUND] })).toEqual({
      blockIds: `${GULBERG},${DGROUND}`,
      sort: 'name',
      page: 1,
      limit: CATALOG_PAGE_SIZE,
    })
  })

  it('adds the search text, the position and a radius only when they apply', () => {
    const origin = { lat: 31.4, lng: 73.1 }
    expect(catalogQuery({ blockIds: [GULBERG], q: '  lawn ', sort: 'price', origin, range: '5' })).toEqual({
      blockIds: GULBERG,
      sort: 'price',
      page: 1,
      limit: CATALOG_PAGE_SIZE,
      q: 'lawn',
      lat: 31.4,
      lng: 73.1,
      radiusKm: '5',
    })
    // "This block" is not a radius, and a position alone is enough to measure distances.
    expect(catalogQuery({ blockIds: [GULBERG], origin, range: 'block' })).toEqual(expect.objectContaining({ lat: 31.4, lng: 73.1 }))
    expect(catalogQuery({ blockIds: [GULBERG], origin, range: 'block' })).not.toHaveProperty('radiusKm')
    expect(catalogQuery({ blockIds: [GULBERG], origin: { lat: 31.4, lng: 73.1 }, range: 'city' })).not.toHaveProperty('radiusKm')
    // Without a position there is nothing to measure from, so "nearest" becomes a name sort.
    expect(catalogQuery({ blockIds: [GULBERG], sort: 'nearest' }).sort).toBe('name')
    expect(catalogQuery({ blockIds: [GULBERG], sort: 'nearest', origin }).sort).toBe('nearest')
  })

  it('fetchCatalogBrowse reads the grouped products and their paging', async () => {
    api.get.mockResolvedValue({ data: { items: [{ catalogProductId: 'c1' }], pagination: { page: 1, pages: 2, total: 13 }, meta: { totalOffers: 20 } } })
    const query = catalogQuery({ blockIds: [GULBERG] })
    const result = await fetchCatalogBrowse(query)
    expect(api.get).toHaveBeenCalledWith('/catalog/browse', { params: query })
    expect(result).toEqual({ items: [{ catalogProductId: 'c1' }], pagination: { page: 1, pages: 2, total: 13 }, meta: { totalOffers: 20 } })
  })

  it('fetchCatalogBrowse treats a missing list as empty', async () => {
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchCatalogBrowse({ blockIds: GULBERG })).toEqual({ items: [], pagination: undefined, meta: undefined })
  })

  it('fetchCatalogOffers asks for one catalogue product inside the area', async () => {
    api.get.mockResolvedValue({ data: { item: { catalogProductId: 'c1', offers: [{ productId: 'p1' }] } } })
    const area = { blockIds: GULBERG, lat: 31.4, lng: 73.1 }
    expect((await fetchCatalogOffers('c1', area)).item.offers).toHaveLength(1)
    expect(api.get).toHaveBeenCalledWith('/catalog/browse/c1', { params: area })
  })
})
