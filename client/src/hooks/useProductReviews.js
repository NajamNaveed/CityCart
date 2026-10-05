import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

const PAGE = 5
const EMPTY = { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }

// A product's reviews, five at a time. "Show more" appends the next five.
export function useProductReviews(productId) {
  const [state, setState] = useState({ id: null, reviews: [], summary: EMPTY, pagination: null, loadingMore: false })

  useEffect(() => {
    let active = true
    api
      .get(`/products/${productId}/reviews`, { params: { limit: PAGE } })
      .then((res) =>
        active && setState({ id: productId, reviews: res.data.reviews, summary: res.data.summary, pagination: res.data.pagination, loadingMore: false }),
      )
      .catch(() => active && setState({ id: productId, reviews: [], summary: EMPTY, pagination: null, loadingMore: false }))
    return () => {
      active = false
    }
  }, [productId])

  const loadMore = useCallback(async () => {
    if (!state.pagination || state.loadingMore) return
    setState((s) => ({ ...s, loadingMore: true }))
    try {
      const res = await api.get(`/products/${productId}/reviews`, { params: { limit: PAGE, page: state.pagination.page + 1 } })
      setState((s) => ({ ...s, reviews: [...s.reviews, ...res.data.reviews], pagination: res.data.pagination, loadingMore: false }))
    } catch {
      setState((s) => ({ ...s, loadingMore: false }))
    }
  }, [productId, state.pagination, state.loadingMore])

  return {
    loading: state.id !== productId,
    reviews: state.reviews,
    summary: state.summary,
    hasMore: Boolean(state.pagination && state.pagination.page < state.pagination.pages),
    loadingMore: state.loadingMore,
    loadMore,
  }
}