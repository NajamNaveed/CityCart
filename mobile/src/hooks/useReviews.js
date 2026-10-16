import { fetchReviews } from '../services/catalog'
import { usePagedList } from './usePagedList'

// A product's reviews, five at a time; `summary` (average, count, 1-5 star counts) arrives with the first page.
export function useReviews(productId) {
  const list = usePagedList(`reviews:${productId}`, async (page) => {
    const result = await fetchReviews(productId, page)
    return { items: result.reviews, pagination: result.pagination, meta: result.summary }
  })
  return { ...list, reviews: list.items, summary: list.meta }
}
