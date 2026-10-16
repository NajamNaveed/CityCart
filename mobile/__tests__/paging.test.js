import { hasMorePages, initialPaging, pagingReducer } from '../src/services/paging'

const item = (id) => ({ _id: id, name: `Item ${id}` })
const run = (...actions) => actions.reduce(pagingReducer, initialPaging)

describe('first page', () => {
  it('stores items and the page counts', () => {
    const state = run({ type: 'first', key: 'a', items: [item(1), item(2)], pagination: { page: 1, pages: 3, total: 30 } })
    expect(state).toMatchObject({ key: 'a', page: 1, pages: 3, total: 30, error: '' })
    expect(state.items).toHaveLength(2)
    expect(hasMorePages(state)).toBe(true)
  })

  it('has nothing more when there is a single page, or nothing at all', () => {
    expect(hasMorePages(run({ type: 'first', key: 'a', items: [item(1)], pagination: { page: 1, pages: 1, total: 1 } }))).toBe(false)
    expect(hasMorePages(run({ type: 'first', key: 'a', items: [], pagination: { page: 1, pages: 0, total: 0 } }))).toBe(false)
    expect(hasMorePages(initialPaging)).toBe(false)
  })

  it('records a failure and clears any old items', () => {
    const state = run(
      { type: 'first', key: 'a', items: [item(1)], pagination: { page: 1, pages: 2, total: 12 } },
      { type: 'firstFailed', key: 'b', error: 'Cannot reach the server.' },
    )
    expect(state).toMatchObject({ key: 'b', items: [], error: 'Cannot reach the server.' })
  })
})

describe('extra data that comes with the first page', () => {
  it('keeps it across later pages and drops it with a new search', () => {
    const first = { type: 'first', key: 'a', items: [item(1)], pagination: { page: 1, pages: 2, total: 2 }, meta: { average: 4.5 } }
    const more = { type: 'more', key: 'a', items: [item(2)], pagination: { page: 2, pages: 2, total: 2 } }
    expect(run(first).meta).toEqual({ average: 4.5 })
    expect(run(first, more).meta).toEqual({ average: 4.5 })
    expect(run(first, { type: 'first', key: 'b', items: [], pagination: { page: 1, pages: 1, total: 0 } }).meta).toBeNull()
  })
})

describe('loading more', () => {
  const first = { type: 'first', key: 'a', items: [item(1), item(2)], pagination: { page: 1, pages: 2, total: 4 } }

  it('appends the next page and moves the page counter', () => {
    const state = run(first, { type: 'moreStart', key: 'a' }, { type: 'more', key: 'a', items: [item(3), item(4)], pagination: { page: 2, pages: 2, total: 4 } })
    expect(state.items.map((i) => i._id)).toEqual([1, 2, 3, 4])
    expect(state).toMatchObject({ page: 2, loadingMore: false })
    expect(hasMorePages(state)).toBe(false)
  })

  it('never shows the same product twice when the list shifted under the shopper', () => {
    const state = run(first, { type: 'more', key: 'a', items: [item(2), item(3)], pagination: { page: 2, pages: 2, total: 4 } })
    expect(state.items.map((i) => i._id)).toEqual([1, 2, 3])
  })

  it('keeps what is already shown, and says why, when the next page fails', () => {
    const state = run(first, { type: 'moreStart', key: 'a' }, { type: 'moreFailed', key: 'a', error: 'Cannot reach the server.' })
    expect(state.items).toHaveLength(2)
    expect(state).toMatchObject({ loadingMore: false, moreError: 'Cannot reach the server.' })
    // trying again clears the message
    expect(pagingReducer(state, { type: 'moreStart', key: 'a' }).moreError).toBe('')
  })
})

describe('answers for an old search are ignored', () => {
  const current = run({ type: 'first', key: 'new search', items: [item(9)], pagination: { page: 1, pages: 2, total: 20 } })

  it.each([
    { type: 'more', key: 'old search', items: [item(1)], pagination: { page: 2, pages: 2, total: 20 } },
    { type: 'moreStart', key: 'old search' },
    { type: 'moreFailed', key: 'old search', error: 'x' },
    { type: 'refreshStart', key: 'old search' },
    { type: 'refreshFailed', key: 'old search', error: 'x' },
  ])('$type for another key changes nothing', (action) => {
    expect(pagingReducer(current, action)).toBe(current)
  })
})

describe('pull to refresh', () => {
  it('starts, then a fresh first page replaces the list and stops the spinner', () => {
    const shown = run({ type: 'first', key: 'a', items: [item(1)], pagination: { page: 1, pages: 3, total: 30 } })
    const refreshing = pagingReducer(shown, { type: 'refreshStart', key: 'a' })
    expect(refreshing.refreshing).toBe(true)
    const done = pagingReducer(refreshing, { type: 'first', key: 'a', items: [item(7), item(8)], pagination: { page: 1, pages: 1, total: 2 } })
    expect(done).toMatchObject({ refreshing: false, page: 1 })
    expect(done.items.map((i) => i._id)).toEqual([7, 8])
  })
})
