import React from 'react'
import { Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

import ListScreen from '../src/components/ListScreen'
import { cleanup, press, screenText, show } from './helpers/screens'

const list = (overrides = {}) => ({
  items: [{ _id: 'a' }],
  loading: false,
  error: '',
  moreError: '',
  refreshError: '',
  loadingMore: false,
  refreshing: false,
  hasMore: true,
  loadMore: jest.fn(),
  refresh: jest.fn(),
  ...overrides,
})

const render = (l) => show(<ListScreen title="Deliveries" list={l} renderItem={() => <Text>row</Text>} keyExtractor={(item) => item._id} empty={{ icon: 'package', title: 'Nothing', message: 'No deliveries.' }} />)

afterEach(cleanup)

describe('the end of a paged list', () => {
  it('says nothing while there is nothing to say', async () => {
    const screen = await render(list())
    expect(screenText(screen)).not.toMatch(/Couldn't load more/)
  })

  it('shows a loader while the next page is on its way', async () => {
    const screen = await render(list({ loadingMore: true }))
    expect(screenText(screen)).toMatch(/Loading more/)
  })

  it('says the next page failed, and tries that page again', async () => {
    const l = list({ moreError: 'Cannot reach the server.' })
    const screen = await render(l)
    expect(screenText(screen)).toMatch(/Couldn't load more/)
    await press(screen, 'Try again')
    expect(l.loadMore).toHaveBeenCalled()
    expect(l.refresh).not.toHaveBeenCalled()
  })

  it('says a pull-to-refresh failed, and refreshes instead of loading another page', async () => {
    const l = list({ refreshError: 'Cannot reach the server.' })
    const screen = await render(l)
    expect(screenText(screen)).toMatch(/Couldn't refresh/)
    await press(screen, 'Try again')
    expect(l.refresh).toHaveBeenCalled()
    expect(l.loadMore).not.toHaveBeenCalled()
  })
})
