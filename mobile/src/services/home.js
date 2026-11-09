import api from './api'

/**
 * The home feed: the shops and products in the shopper's city. It uses the same
 * public discovery endpoint as Nearby, scoped to the city, and the ordering rules
 * are pure so they can be tested without a phone.
 */
export const HOME_STORES = 6
export const HOME_PRODUCTS = 8

export function storeInBlocks(store, blockIds = []) {
  const wanted = new Set((blockIds || []).map(String))
  if (wanted.size === 0) return false
  return (store?.branches || []).some((branch) => wanted.has(String(branch.blockId)))
}

// Shops inside the shopper's own blocks come first; otherwise the server's order stands.
export function orderHomeStores(stores, blockIds = []) {
  if (!Array.isArray(stores)) return []
  if (!blockIds || blockIds.length === 0) return [...stores]
  return [...stores].sort((a, b) => Number(storeInBlocks(b, blockIds)) - Number(storeInBlocks(a, blockIds)))
}

// One product from each shop per round, so the shelf shows the breadth of the
// block instead of one shop's catalogue. A name stocked by several shops is
// shown once.
export function homeShelf(stores, limit = HOME_PRODUCTS) {
  const shelves = (Array.isArray(stores) ? stores : [])
    .map((store) =>
      (Array.isArray(store.products) ? store.products : []).map((product) => ({
        ...product,
        brandName: store.name,
        brandId: store._id,
        distanceKm: store.nearestKm,
      })),
    )
    .filter((shelf) => shelf.length > 0)

  const seen = new Set()
  const picked = []
  for (let round = 0; picked.length < limit; round += 1) {
    let foundAny = false
    for (const shelf of shelves) {
      const product = shelf[round]
      if (!product) continue
      foundAny = true
      const name = String(product.name || '').trim().toLowerCase()
      if (seen.has(name)) continue
      seen.add(name)
      picked.push(product)
      if (picked.length === limit) break
    }
    if (!foundAny) break
  }
  return picked
}

export async function fetchHomeFeed({ cityId = '', blockIds = [], limit = HOME_STORES } = {}) {
  if (!cityId) return { stores: [], products: [] }
  const res = await api.get('/discover', { params: { cityId, scope: 'city', limit } })
  const stores = orderHomeStores(Array.isArray(res.data?.items) ? res.data.items : [], blockIds)
  return { stores, products: homeShelf(stores) }
}
