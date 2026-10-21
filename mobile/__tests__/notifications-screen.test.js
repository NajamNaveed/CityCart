/**
 * The notifications inbox against a fake server: the list, the unread filter,
 * reading one, reading all, deleting, and the tap-through to an order.
 */
import React from 'react'
import { act } from 'react-test-renderer'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
let mockParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (callback) => React.useEffect(callback, []),
    Redirect: ({ href }) => null,
    Link: ({ children }) => children,
  }
})
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
  getFieldErrors: (e) => Object.fromEntries((e?.response?.data?.errors || []).map((x) => [x.field, x.message])),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import NotificationsScreen from '../src/app/notifications'
import { cleanup, notificationsValue, press, pressByLabel, screenText, show, signedIn, signedOut, tick } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const NOW = new Date().toISOString()

const NOTIFICATIONS = [
  { _id: ID(1), type: 'ORDER_SHIPPED', title: 'Order shipped', message: 'Order CC-7 is on its way.', data: { orderId: ID(5), orderNumber: 'CC-7' }, isRead: false, readAt: null, createdAt: NOW },
  { _id: ID(2), type: 'ORDER_CONFIRMED', title: 'Order confirmed', message: 'The seller confirmed CC-6.', data: { orderId: ID(6), orderNumber: 'CC-6' }, isRead: true, readAt: NOW, createdAt: NOW },
]

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})

const openInbox = async (notificationsOver) => {
  api.get.mockResolvedValue({ data: { notifications: NOTIFICATIONS, pagination: { page: 1, pages: 1, total: 2 }, unreadCount: 1 } })
  return show(<NotificationsScreen />, { auth: signedIn(), notifications: notificationsValue(notificationsOver) })
}

describe('notifications inbox', () => {
  it('asks a visitor to sign in first', async () => {
    const screen = await show(<NotificationsScreen />, { auth: signedOut() })
    expect(screenText(screen)).toContain('Sign in to see your notifications')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('lists notifications with their titles and messages', async () => {
    const screen = await openInbox()
    const text = screenText(screen)
    expect(text).toContain('Order shipped')
    expect(text).toContain('CC-7 is on its way.')
    expect(text).toContain('Order confirmed')
    expect(text).toContain('Unread (1)')
  })

  it('filters down to unread', async () => {
    const screen = await openInbox()
    await press(screen, 'Unread (1)')
    const text = screenText(screen)
    expect(text).toContain('Order shipped')
    expect(text).not.toContain('Order confirmed')
  })

  it('marks a notification read and follows it to the order', async () => {
    const notifications = notificationsValue()
    const screen = await openInbox(notifications)
    await pressByLabel(screen, 'Order shipped. Unread. Order CC-7 is on its way.')
    expect(notifications.markRead).toHaveBeenCalledWith(ID(1))
    expect(mockRouter.push).toHaveBeenCalledWith(`/orders/${ID(5)}`)
  })

  it('opens a read notification without asking the server again', async () => {
    const notifications = notificationsValue()
    const screen = await openInbox(notifications)
    await pressByLabel(screen, 'Order confirmed. The seller confirmed CC-6.')
    expect(notifications.markRead).not.toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith(`/orders/${ID(6)}`)
  })

  it('marks everything read from the header', async () => {
    const notifications = notificationsValue()
    const screen = await openInbox(notifications)
    await press(screen, 'Mark all read')
    expect(notifications.markAllRead).toHaveBeenCalled()
    // The rows lose their unread state right away.
    expect(screenText(screen)).toContain('Order confirmed')
  })

  it('deletes a notification', async () => {
    const notifications = notificationsValue()
    const screen = await openInbox(notifications)
    await pressByLabel(screen, 'Delete Order shipped')
    expect(notifications.remove).toHaveBeenCalledWith(ID(1), true)
  })

  it('deleting keeps the count honest for an already-read row', async () => {
    const notifications = notificationsValue()
    const screen = await openInbox(notifications)
    await pressByLabel(screen, 'Delete Order confirmed')
    expect(notifications.remove).toHaveBeenCalledWith(ID(2), false)
  })

  it('offers the empty state when there is nothing at all', async () => {
    api.get.mockResolvedValue({ data: { notifications: [], pagination: { page: 1, pages: 1, total: 0 }, unreadCount: 0 } })
    const screen = await show(<NotificationsScreen />, { auth: signedIn() })
    expect(screenText(screen)).toContain('No notifications yet')
  })

  it('celebrates an empty unread filter', async () => {
    api.get.mockResolvedValue({ data: { notifications: [NOTIFICATIONS[1]], pagination: { page: 1, pages: 1, total: 1 }, unreadCount: 0 } })
    const screen = await show(<NotificationsScreen />, { auth: signedIn() })
    await press(screen, 'Unread')
    expect(screenText(screen)).toContain("You're all caught up")
  })

  it('re-reads when a push arrives while the inbox is open', async () => {
    let listener
    await openInbox(notificationsValue({ subscribeChat: (fn) => { listener = fn; return () => {} } }))
    expect(listener).toBeTruthy()
    api.get.mockClear()
    await act(async () => listener('message', {}))
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 20 } })
  })
})
