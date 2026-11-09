import api from './api'

/**
 * Everything the browsing screens ask the API. The query building is pure so it
 * can be tested; the fetchers are thin wrappers that return plain data.
 */
export const REVIEWS_PAGE_SIZE = 5

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

// Every store in the area that sells one catalogue item. 404 means "not sold here".
export async function fetchCatalogOffers(catalogProductId, area) {
  const res = await api.get(`/catalog/browse/${catalogProductId}`, { params: area })
  return res.data
}

// A store's public page: brand, store details, the categories it sells in and its
// newest products. Everything is scoped to this one brand by the server.
export async function fetchStorefront(brandId) {
  const res = await api.get(`/brands/${brandId}/storefront`)
  return {
    brand: res.data.brand || null,
    store: res.data.store || null,
    categories: Array.isArray(res.data.categories) ? res.data.categories : [],
    featuredProducts: Array.isArray(res.data.featuredProducts) ? res.data.featuredProducts : [],
  }
}
