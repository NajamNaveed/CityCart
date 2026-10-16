jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import api from '../src/services/api'
import { fetchBrands, fetchProduct, fetchProducts, fetchRatings, fetchReviews, PAGE_SIZE, productQuery, SORTS } from '../src/services/catalog'

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
