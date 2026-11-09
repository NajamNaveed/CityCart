jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import api from '../src/services/api'
import { fetchHomeFeed, homeShelf, orderHomeStores, storeInBlocks } from '../src/services/home'

const product = (id, name, price = 1000) => ({ _id: id, name, price })

const STORE_IN = {
  _id: 'b1',
  name: 'Zed Store',
  nearestKm: null,
  branches: [{ _id: 'br1', blockId: 'block1' }],
  products: [product('p1', 'Lawn'), product('p2', 'Kurta')],
}
const STORE_OUT = {
  _id: 'b2',
  name: 'Alpha Store',
  nearestKm: null,
  branches: [{ _id: 'br2', blockId: 'block2' }],
  products: [product('p3', 'Lawn'), product('p4', 'Shawl')],
}

beforeEach(() => jest.clearAllMocks())

describe('ordering', () => {
  it('knows when a shop has a branch in the chosen blocks', () => {
    expect(storeInBlocks(STORE_IN, ['block1'])).toBe(true)
    expect(storeInBlocks(STORE_IN, ['block2'])).toBe(false)
    expect(storeInBlocks(STORE_IN, [])).toBe(false)
    expect(storeInBlocks(null, ['block1'])).toBe(false)
  })

  it('puts shops in the shopper\'s blocks first and keeps the rest in order', () => {
    expect(orderHomeStores([STORE_OUT, STORE_IN], ['block1']).map((store) => store.name)).toEqual(['Zed Store', 'Alpha Store'])
    expect(orderHomeStores([STORE_OUT, STORE_IN], []).map((store) => store.name)).toEqual(['Alpha Store', 'Zed Store'])
    expect(orderHomeStores(null)).toEqual([])
  })
})

describe('the shelf', () => {
  it('takes one product per shop per round, skipping a name already shown', () => {
    expect(homeShelf([STORE_IN, STORE_OUT]).map((item) => item.name)).toEqual(['Lawn', 'Kurta', 'Shawl'])
  })

  it('stops at the limit and labels each product with its shop', () => {
    const shelf = homeShelf([STORE_IN, STORE_OUT], 2)
    expect(shelf).toHaveLength(2)
    expect(shelf[0]).toMatchObject({ name: 'Lawn', brandName: 'Zed Store', brandId: 'b1' })
  })

  it('is empty when no shop has products', () => {
    expect(homeShelf([{ ...STORE_IN, products: [] }])).toEqual([])
  })
})

describe('fetchHomeFeed', () => {
  it('asks for the chosen city and shapes the feed', async () => {
    api.get.mockResolvedValue({ data: { items: [STORE_OUT, STORE_IN], meta: { totalBranches: 2 } } })
    const feed = await fetchHomeFeed({ cityId: 'c1', blockIds: ['block1'] })
    expect(api.get).toHaveBeenCalledWith('/discover', { params: { cityId: 'c1', scope: 'city', limit: 6 } })
    expect(feed.stores.map((store) => store.name)).toEqual(['Zed Store', 'Alpha Store'])
    expect(feed.products.map((item) => item.name)).toEqual(['Lawn', 'Kurta', 'Shawl'])
  })

  it('does not ask the server without a city', async () => {
    expect(await fetchHomeFeed({ cityId: '' })).toEqual({ stores: [], products: [] })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('treats an odd answer as an empty feed', async () => {
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchHomeFeed({ cityId: 'c1' })).toEqual({ stores: [], products: [] })
  })
})
