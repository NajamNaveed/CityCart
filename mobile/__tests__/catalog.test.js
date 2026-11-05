jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import api from '../src/services/api'
import { fetchBrands, fetchCatalogOffers, fetchProduct, fetchRatings, fetchReviews } from '../src/services/catalog'

beforeEach(() => jest.clearAllMocks())

describe('fetchers', () => {
  it('treats a missing brand list as empty', async () => {
    api.get.mockResolvedValue({ data: {} })
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

describe('catalogue offers', () => {
  const GULBERG = '64b7f0c2a1b2c3d4e5f60704'

  it('asks for one catalogue product inside the area', async () => {
    api.get.mockResolvedValue({ data: { item: { catalogProductId: 'c1', offers: [{ productId: 'p1' }] } } })
    const area = { blockIds: GULBERG, lat: 31.4, lng: 73.1 }
    expect((await fetchCatalogOffers('c1', area)).item.offers).toHaveLength(1)
    expect(api.get).toHaveBeenCalledWith('/catalog/browse/c1', { params: area })
  })
})
