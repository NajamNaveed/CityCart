/**
 * State for "load the first page, then more as the shopper scrolls". A reducer
 * with no React in it, so every rule below can be tested. `key` identifies the
 * query (search text, filters...): an answer that arrives for an OLD key is
 * ignored, so a slow response can never overwrite a newer search.
 */
export const initialPaging = {
  key: null,
  items: [],
  page: 0,
  pages: 1,
  total: 0,
  meta: null,
  error: '',
  moreError: '',
  loadingMore: false,
  refreshing: false,
}

export function pagingReducer(state, action) {
  switch (action.type) {
    case 'first':
      return {
        ...initialPaging,
        key: action.key,
        items: action.items,
        page: action.pagination?.page || 1,
        pages: action.pagination?.pages || 1,
        total: action.pagination?.total ?? action.items.length,
        meta: action.meta ?? null,
      }
    case 'firstFailed':
      return { ...initialPaging, key: action.key, error: action.error }
    case 'refreshStart':
      return action.key === state.key ? { ...state, refreshing: true } : state
    case 'moreStart':
      return action.key === state.key ? { ...state, loadingMore: true, moreError: '' } : state
    case 'more': {
      if (action.key !== state.key) return state
      const seen = new Set(state.items.map((item) => item._id))
      const fresh = action.items.filter((item) => !seen.has(item._id)) // a page shifting under us must not duplicate rows
      return {
        ...state,
        items: [...state.items, ...fresh],
        page: action.pagination?.page || state.page + 1,
        pages: action.pagination?.pages || state.pages,
        total: action.pagination?.total ?? state.total,
        loadingMore: false,
      }
    }
    case 'moreFailed':
      return action.key === state.key ? { ...state, loadingMore: false, moreError: action.error } : state
    case 'refreshFailed':
      return action.key === state.key ? { ...state, refreshing: false, moreError: action.error } : state
    default:
      return state
  }
}

export const hasMorePages = (state) => state.page > 0 && state.page < state.pages
