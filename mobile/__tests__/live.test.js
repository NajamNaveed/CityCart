/**
 * The live wiring (Phase 6): one socket for a signed-in shopper, the
 * notification badge over it, and the chat unread count that re-reads when
 * pushes arrive. The socket service is faked; REST is faked.
 */

const mockSocket = { on: jest.fn(), disconnect: jest.fn() }

jest.mock('../src/services/socket', () => ({
  __esModule: true,
  createLiveConnection: jest.fn(() => mockSocket),
  closeLiveConnection: jest.fn((socket) => socket && socket.disconnect()),
}))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (e, fallback) => fallback || 'x',
  getFieldErrors: () => ({}),
  setUnauthorizedHandler: jest.fn(),
}))

import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import api from '../src/services/api'
import { closeLiveConnection, createLiveConnection } from '../src/services/socket'
import { AuthContext } from '../src/context/contexts'
import { NotificationProvider } from '../src/context/NotificationProvider'
import { ChatProvider } from '../src/context/ChatProvider'
import { useChat } from '../src/hooks/useChat'
import { useNotifications } from '../src/hooks/useNotifications'

jest.setTimeout(30000)

let seen
function Probe() {
  seen = { notifications: useNotifications(), chat: useChat() }
  return null
}

const SIGNED_IN = { status: 'signedIn', user: { id: 'u1', role: 'CUSTOMER' }, isReady: true, offline: false, login: jest.fn(), register: jest.fn(), logout: jest.fn(), retry: jest.fn() }
const SIGNED_OUT = { status: 'signedOut', user: null, isReady: true, offline: false, login: jest.fn(), register: jest.fn(), logout: jest.fn(), retry: jest.fn() }

async function mount(auth = SIGNED_IN) {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(
      <AuthContext.Provider value={auth}>
        <NotificationProvider>
          <ChatProvider>
            <Probe />
          </ChatProvider>
        </NotificationProvider>
      </AuthContext.Provider>,
    )
  })
  return renderer
}

const handlerFor = (event) => mockSocket.on.mock.calls.find(([name]) => name === event)?.[1]

beforeEach(() => {
  jest.clearAllMocks()
  seen = null
})

afterEach(async () => {
  await act(async () => {})
})

describe('the one live connection', () => {
  it('connects for a signed-in shopper and closes when they leave', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 0 } })
    const renderer = await mount()
    expect(createLiveConnection).toHaveBeenCalledTimes(1)
    // Count and chat unread both read themselves at start.
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 1 } })
    expect(api.get).toHaveBeenCalledWith('/chats/unread-count')

    await act(async () => renderer.update(
      <AuthContext.Provider value={SIGNED_OUT}>
        <NotificationProvider>
          <ChatProvider>
            <Probe />
          </ChatProvider>
        </NotificationProvider>
      </AuthContext.Provider>,
    ))
    expect(closeLiveConnection).toHaveBeenCalledWith(mockSocket)
    expect(seen.notifications.unreadCount).toBe(0)
    expect(seen.chat.unread).toBe(0)
  })

  it('never connects for a visitor', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 3, unread: 2 } })
    await mount(SIGNED_OUT)
    expect(createLiveConnection).not.toHaveBeenCalled()
    expect(seen.notifications.unreadCount).toBe(0)
    expect(seen.chat.unread).toBe(0)
  })

  it('bumps the badge when a notification is pushed', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 0 } })
    await mount()
    await act(async () => handlerFor('notification')({ _id: 'n1', title: 'Order shipped' }))
    expect(seen.notifications.unreadCount).toBe(1)
  })

  it('hands chat pushes to subscribers and re-reads the count once', async () => {
    jest.useFakeTimers()
    try {
      api.get.mockImplementation((url) => Promise.resolve(url === '/chats/unread-count' ? { data: { unread: 1 } } : { data: { unreadCount: 0 } }))
      await mount()
      expect(seen.chat.unread).toBe(1)

      const listener = jest.fn()
      await act(async () => seen.notifications.subscribeChat(listener))
      const payload = { conversationId: 'c1', message: { _id: 'm1' } }
      await act(async () => {
        handlerFor('chat:message')(payload)
        handlerFor('chat:message')(payload)
      })
      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenCalledWith('message', payload)

      // One burst, one re-read — 300 ms after the last push.
      const countCalls = () => api.get.mock.calls.filter(([url]) => url === '/chats/unread-count').length
      const before = countCalls()
      await act(async () => {
        jest.advanceTimersByTime(299)
      })
      expect(countCalls()).toBe(before)
      await act(async () => {
        jest.advanceTimersByTime(1)
      })
      expect(countCalls()).toBe(before + 1)
      expect(seen.chat.unread).toBe(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('tells subscribers to resync when the connection comes back', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 0 } })
    await mount()
    const listener = jest.fn()
    await act(async () => seen.notifications.subscribeChat(listener))
    // The first connect is the fresh arrival; a second one means a reconnect.
    await act(async () => handlerFor('connect')())
    await act(async () => handlerFor('connect')())
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('resync')
  })

  it('keeps the badge honest: read one, read all', async () => {
    api.get.mockResolvedValue({ data: { unreadCount: 2 } })
    await mount()
    expect(seen.notifications.unreadCount).toBe(2)
    api.patch.mockResolvedValue({ data: { notification: { _id: 'n1', isRead: true } } })
    await act(async () => seen.notifications.markRead('n1'))
    expect(seen.notifications.unreadCount).toBe(1)
    api.patch.mockResolvedValue({ data: { updated: 1 } })
    await act(async () => seen.notifications.markAllRead())
    expect(seen.notifications.unreadCount).toBe(0)
    // Deleting an unread one also frees it from the badge.
    api.delete.mockResolvedValue({ data: {} })
    await act(async () => handlerFor('notification')({ _id: 'n9' }))
    expect(seen.notifications.unreadCount).toBe(1)
    await act(async () => seen.notifications.remove('n9', true))
    expect(seen.notifications.unreadCount).toBe(0)
  })
})
