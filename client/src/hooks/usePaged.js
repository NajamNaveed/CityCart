import { useState } from 'react'

// Client-side paging for short lists the API returns whole (categories,
// branches, cities, blocks). Returns the current slice plus a `pagination`
// object in the same shape the shared <Pager> already reads from the API.
// The page is clamped, so deleting the last row of the last page steps back.
export function usePaged(list, pageSize = 10) {
  const [page, setPage] = useState(1)
  const total = list ? list.length : 0
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages)
  const items = list ? list.slice((current - 1) * pageSize, current * pageSize) : []
  return { items, pagination: { page: current, pages, total, limit: pageSize }, setPage }
}
