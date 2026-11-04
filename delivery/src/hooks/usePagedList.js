import { useCallback, useEffect, useReducer, useRef } from 'react'
import { getErrorMessage } from '../services/api'
import { hasMorePages, initialPaging, pagingReducer } from '../services/paging'

/**
 * An endless list. `key` describes the query; whenever it changes the list starts over.
 * `fetchPage(page)` must resolve { items, pagination: { page, pages, total }, meta? }; `meta` is
 * anything the first page carries besides items (the reviews summary), returned as `list.meta`.
 *
 *   const list = usePagedList(key, (page) => fetchProducts({ ...query, page }))
 *   list.items, list.loading, list.error, list.loadMore(), list.refresh(), ...
 */
export function usePagedList(key, fetchPage) {
  const [state, dispatch] = useReducer(pagingReducer, initialPaging)
  const fetchRef = useRef(fetchPage)
  const stateRef = useRef(state)

  useEffect(() => {
    fetchRef.current = fetchPage
    stateRef.current = state
  })

  useEffect(() => {
    let active = true
    fetchRef.current(1)
      .then(({ items, pagination, meta }) => active && dispatch({ type: 'first', key, items, pagination, meta }))
      .catch((err) => active && dispatch({ type: 'firstFailed', key, error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [key])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    if (current.key !== key || current.loadingMore || current.refreshing || !hasMorePages(current)) return
    dispatch({ type: 'moreStart', key })
    try {
      const { items, pagination } = await fetchRef.current(current.page + 1)
      dispatch({ type: 'more', key, items, pagination })
    } catch (err) {
      dispatch({ type: 'moreFailed', key, error: getErrorMessage(err) })
    }
  }, [key])

  const refresh = useCallback(async () => {
    dispatch({ type: 'refreshStart', key })
    try {
      const { items, pagination, meta } = await fetchRef.current(1)
      dispatch({ type: 'first', key, items, pagination, meta })
    } catch (err) {
      dispatch({ type: 'refreshFailed', key, error: getErrorMessage(err) })
    }
  }, [key])

  // Until the answer for THIS key arrives the list is "loading", whatever the old key left behind.
  const current = state.key === key
  return {
    items: current ? state.items : [],
    loading: !current,
    error: current ? state.error : '',
    moreError: current ? state.moreError : '',
    total: current ? state.total : 0,
    meta: current ? state.meta : null,
    loadingMore: current && state.loadingMore,
    refreshing: current && state.refreshing,
    hasMore: current && hasMorePages(state),
    loadMore,
    refresh,
  }
}
