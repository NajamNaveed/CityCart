import api from './api'
import { isRadius } from '../utils/range'

/**
 * Everything the browsing screens ask the API. The query building is pure so it
 * can be tested; the fetchers are thin wrappers that return plain data.
 */
export const PAGE_SIZE = 12
export const REVIEWS_PAGE_SIZE = 5
export const CATALOG_PAGE_SIZE = 12

// Same four choices as the web shop.
export const SORTS = [
  { key: 'newest', label: 'Newest', params: { sort: 'createdAt', order: 'desc' } },
  { key: 'price-asc', label: 'Price: low to high', params: { sort: 'price', order: 'asc' } },
  { key: 'price-desc', label: 'Price: high to low', params: { sort: 'price', order: 'desc' } },
  { key: 'name', label: 'Name: A to Z', params: { sort: 'name', order: 'asc' } },
]

export function productQuery({ search = '', brandId = '', sortKey = 'newest', cityId = '', page = 1, limit = PAGE_SIZE } = {}) {
  const sort = SORTS.find((s) => s.key === sortKey) || SORTS[0]
  const text = String(search).trim()
  return {
    page,
    limit,
    ...sort.params,
    ...(text && { search: text }),
    ...(brandId && { brandId }),
    ...(cityId && { cityId }),
  }
}

export async function fetchProducts(options) {
  const res = await api.get('/products', { params: productQuery(options) })
  return { items: res.data.products || [], pagination: res.data.pagination }
}

export async function fetchBrands(cityId = '') {
  const res = await api.get('/brands', { params: cityId ? { cityId } : {} })
  return Array.isArray(res.data.brands) ? res.data.brands : []
}

// { [productId]: { average, count } }; products nobody reviewed are absent.
export async function fetchRatings(productIds) {
  if (productIds.length === 0) return {}
  const res = await api.get('/reviews/summary', { params: { productIds: productIds.join(',') } })
  return res.data.ratings || {}
}

// The product, plus its brand for the header. The page still works without the brand.
export async function fetchProduct(id) {
  const res = await api.get(`/products/${id}`)
  const product = res.data.product
  let brand = null
  try {
    brand = (await api.get(`/brands/${product.brandId}`)).data.brand
  } catch {
    /* no brand header */
  }
  return { product, brand }
}

export async function fetchReviews(productId, page = 1) {
  const res = await api.get(`/products/${productId}/reviews`, { params: { limit: REVIEWS_PAGE_SIZE, page } })
  return { reviews: res.data.reviews || [], summary: res.data.summary, pagination: res.data.pagination }
}

// The shared catalogue grouped per real product, inside the shopper's area. Every
// offer is a store listing, so the same item appears once with all its stores.
export const CATALOG_SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Lowest price' },
  { key: 'nearest', label: 'Nearest store' },
]

export function catalogQuery({ blockIds = [], origin = null, range = 'block', sort = 'name', q = '', page = 1, limit = CATALOG_PAGE_SIZE } = {}) {
  if (!Array.isArray(blockIds) || blockIds.length === 0) return null
  const text = String(q || '').trim()
  // "Nearest" is meaningless without a position to measure from (several blocks chosen by hand).
  const order = sort === 'nearest' && !origin ? 'name' : sort
  return {
    blockIds: blockIds.join(','),
    sort: order,
    page,
    limit,
    ...(text && { q: text }),
    ...(origin && { lat: origin.lat, lng: origin.lng }),
    ...(origin && isRadius(range) && { radiusKm: range }),
  }
}

export async function fetchCatalogBrowse(query) {
  const res = await api.get('/catalog/browse', { params: query })
  return { items: res.data.items || [], pagination: res.data.pagination, meta: res.data.meta }
}

// Every store in the area that sells one catalogue item. 404 means "not sold here".
export async function fetchCatalogOffers(catalogProductId, area) {
  const res = await api.get(`/catalog/browse/${catalogProductId}`, { params: area })
  return res.data
}
