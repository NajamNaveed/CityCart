import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useCity } from './useCity'

const EMPTY = { stores: [], products: [], providers: [], failed: false }

// Stores and products come from one discovery call (the same public endpoint
// the Nearby page uses); providers come from service discovery. Both are
// scoped to a city — the shopper's chosen one, or the first live city.
export function useHomeFeed(blockIds = []) {
  const { cities, city, citiesReady } = useCity()
  const feedCity = city || cities[0] || null
  const feedCityId = feedCity?._id || ''
  const [state, setState] = useState({ key: '', ...EMPTY })

  const key = feedCityId

  useEffect(() => {
    if (!feedCityId) return undefined
    let active = true
    Promise.all([
      api.get('/discover', { params: { cityId: feedCityId, scope: 'city', limit: 8 } }),
      // A services outage must not blank the shops feed.
      api
        .get('/services/discover', { params: { cityId: feedCityId, scope: 'city', limit: 6, sort: 'rank' } })
        .catch(() => null),
    ])
      .then(([storesRes, servicesRes]) => {
        if (!active) return
        setState({
          key,
          stores: Array.isArray(storesRes.data?.items) ? storesRes.data.items : [],
          products: [],
          providers: Array.isArray(servicesRes?.data?.items) ? servicesRes.data.items : [],
          failed: false,
        })
      })
      .catch(() => active && setState({ key, ...EMPTY, failed: true }))
    return () => {
      active = false
    }
  }, [feedCityId, key])

  const data = state.key === key ? state : null

  // Stores in the shopper's own block come first, nearest next. Products keep
  // that order so the shelf opens with what is actually around the corner.
  const stores = useMemo(() => {
    const list = data?.stores || []
    let ordered = list
    if (blockIds.length > 0) {
      const wanted = new Set(blockIds)
      const inBlock = (store) =>
        (store.branches || []).some((branch) => wanted.has(String(branch.blockId)))
      ordered = [...list].sort((a, b) => Number(inBlock(b)) - Number(inBlock(a)))
    }

    // Shops often reuse the same product photo; walk the list so each card gets
    // a different cover while one is available.
    const usedCovers = new Set()
    return ordered.map((store) => {
      const images = (Array.isArray(store.products) ? store.products : [])
        .map((product) => product.image)
        .filter(Boolean)
      const cover = images.find((src) => !usedCovers.has(src)) || images[0]
      if (cover) usedCovers.add(cover)
      return cover ? { ...store, cover } : store
    })
  }, [data, blockIds])

  // One item from each shop per round, so the shelf shows the breadth of the
  // block instead of one shop's full catalogue. Same-name items are skipped
  // after the first shop that stocks them.
  const products = useMemo(() => {
    const shelves = stores
      .map((store) =>
        (Array.isArray(store.products) ? store.products : []).map((product) => ({
          ...product,
          brandName: store.name,
          distanceKm: store.nearestKm,
        })),
      )
      .filter((shelf) => shelf.length > 0)

    const seen = new Set()
    const picked = []
    for (let round = 0; picked.length < 8; round += 1) {
      let foundAny = false
      for (const shelf of shelves) {
        const product = shelf[round]
        if (!product) continue
        foundAny = true
        const name = product.name.trim().toLowerCase()
        if (seen.has(name)) continue
        seen.add(name)
        picked.push(product)
        if (picked.length === 8) break
      }
      if (!foundAny) break
    }
    return picked
  }, [stores])

  const providers = useMemo(() => {
    const list = data?.providers || []
    if (blockIds.length === 0) return list
    const wanted = new Set(blockIds)
    const inBlock = (provider) => provider.block?._id && wanted.has(String(provider.block._id))
    return [...list].sort((a, b) => Number(inBlock(b)) - Number(inBlock(a)))
  }, [data, blockIds])

  const loading = !citiesReady || (Boolean(feedCityId) && state.key !== key)

  return {
    city: feedCity,
    stores,
    products,
    providers,
    loading,
    failed: Boolean(data?.failed),
  }
}
