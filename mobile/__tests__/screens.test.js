/**
 * Renders the real browsing screens against a fake server. Not pixel checks:
 * these catch the crashes bundling cannot (a wrong prop, a missing value, a
 * state that never resolves) and check that what the shopper reads on screen
 * matches what the API said.
 */
import React from 'react'
import { Text } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import { tree } from './helpers/screens'

// The first render in a fresh test process loads the whole app, which is slow on a busy machine.
jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
let mockParams = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
  Link: ({ children }) => children,
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../src/services/api', () => {
  const get = jest.fn()
  return { __esModule: true, default: { get, post: jest.fn() }, getErrorMessage: (e) => e?.message || 'Something went wrong.', getFieldErrors: () => ({}), setUnauthorizedHandler: jest.fn() }
})

import api from '../src/services/api'
import { CityProvider } from '../src/context/CityProvider'
import Home from '../src/app/(tabs)/index'
import Brands from '../src/app/brands'
import ProductScreen from '../src/app/product/[id]'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BRAND = { _id: ID(1), name: 'Loom & Co.', description: 'Handloom lawn and khaddar.', logo: '' }
const PRODUCT = {
  _id: ID(2),
  brandId: BRAND._id,
  name: 'Mehrunisa Printed Lawn',
  description: 'A soft three-piece lawn suit.',
  price: 3600,
  compareAtPrice: 4400,
  images: ['https://picsum.photos/seed/a/800/1000', 'https://picsum.photos/seed/b/800/1000'],
  availability: 'LOW_STOCK',
  sku: 'LOOM-001',
  attributes: { Fabric: 'Cotton lawn', Pieces: '3' },
}
const REVIEW = { _id: ID(3), rating: 5, title: 'Lovely fabric', comment: 'Soft and the colours are true.', reviewerName: 'Sana I.', verifiedPurchase: true, createdAt: '2026-09-01T10:00:00Z' }
const SUMMARY = { average: 4.5, count: 2, distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } }

// A tiny fake of the CityCart API.
function serve({ failBrands = false, emptyBrands = false } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === '/cities') return { data: { cities: [{ _id: ID(9), name: 'Faisalabad' }] } }
    if (url === '/brands') {
      if (failBrands) throw new Error('Cannot reach the server. Check your connection.')
      return { data: { brands: emptyBrands ? [] : [BRAND] } }
    }
    if (url === `/brands/${BRAND._id}`) return { data: { brand: BRAND } }
    if (url === `/products/${PRODUCT._id}`) return { data: { product: PRODUCT } }
    if (url === `/products/${PRODUCT._id}/reviews`) return { data: { reviews: [REVIEW], summary: SUMMARY, pagination: { page: 1, pages: 1, total: 2 } } }
    throw new Error(`unexpected request ${url}`)
  })
}

const opened = []
afterEach(async () => {
  while (opened.length) {
    const renderer = opened.pop()
    await act(async () => renderer.unmount())
  }
})

// Render, then let every promise settle (the screens load data when they open).
async function show(element) {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(tree(<CityProvider>{element}</CityProvider>))
  })
  opened.push(renderer)
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve() })
  return renderer
}

const screenText = (renderer) =>
  renderer.root
    .findAllByType(Text)
    .map((node) => [].concat(node.props.children).flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .join(' | ')

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  serve()
})

describe('Home', () => {
  it('shows the brands and a way to search them', async () => {
    const text = screenText(await show(<Home />))
    expect(text).toContain('CityCart')
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('Brands')
    expect(text).not.toContain('New arrivals')
  })

  it('says so, with a way to retry, when the server cannot be reached', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/cities') return { data: { cities: [] } }
      throw new Error('Cannot reach the server. Check your connection.')
    })
    const text = screenText(await show(<Home />))
    expect(text).toContain("Can't reach the server")
    expect(text).toContain('Try again')
  })

  it('says when no brand is selling yet', async () => {
    serve({ emptyBrands: true })
    expect(screenText(await show(<Home />))).toContain('No brands are selling here yet.')
  })
})

describe('Brands', () => {
  it('lists each brand with its description', async () => {
    const text = screenText(await show(<Brands />))
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('Handloom lawn and khaddar.')
    expect(text).toContain('1 brand on CityCart')
  })
})

describe('Product page', () => {
  it('shows the product, its price, stock, details and reviews', async () => {
    mockParams = { id: PRODUCT._id }
    const text = screenText(await show(<ProductScreen />))
    expect(text).toContain('Mehrunisa Printed Lawn')
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('Rs 3,600')
    expect(text).toContain('18% off')
    expect(text).toContain('Only a few left')
    expect(text).toContain('A soft three-piece lawn suit.')
    expect(text).toContain('Cotton lawn')
    expect(text).toContain('LOOM-001')
    expect(text).toContain('What customers say')
    expect(text).toContain('Lovely fabric')
    expect(text).toContain('Verified purchase')
    expect(text).toContain('2 reviews')
  })

  it('does not ask the server about a malformed id, and says the product is not available', async () => {
    mockParams = { id: 'not-an-id' }
    const text = screenText(await show(<ProductScreen />))
    expect(text).toContain('This product is not available')
    expect(api.get.mock.calls.some(([url]) => String(url).startsWith('/products/'))).toBe(false)
  })

  it('says not available for a product the server no longer has', async () => {
    mockParams = { id: ID(7) }
    api.get.mockImplementation(async (url) => {
      if (url === '/cities') return { data: { cities: [] } }
      throw Object.assign(new Error('Product not found.'), { response: { status: 404, data: {} } })
    })
    expect(screenText(await show(<ProductScreen />))).toContain('This product is not available')
  })
})
