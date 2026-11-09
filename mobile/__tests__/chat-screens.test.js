/**
 * The chat screens against a fake server: the conversation list, the thread
 * with its composer, and starting a chat from a product page.
 */
import React from 'react'
import { Text } from 'react-native'
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
import ChatScreen from '../src/app/chat/index'
import ChatThread from '../src/app/chat/[id]'
import ProductScreen from '../src/app/product/[id]'
import { CUSTOMER, cleanup, chatValue, press, pressByLabel, screenText, show, signedIn, signedOut, textOf, tick, type, tree } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const TODAY = new Date().toISOString()
const YESTERDAY = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

const CONVERSATIONS = [
  { _id: ID(1), with: { name: 'Loom & Co.', image: '' }, canSend: true, lastMessageAt: TODAY, lastMessagePreview: 'Ships tomorrow', lastSenderRole: 'BRAND', unread: 2 },
  { _id: ID(2), with: { name: 'Mehr Menswear', image: '' }, canSend: true, lastMessageAt: YESTERDAY, lastMessagePreview: 'You: Thanks!', lastSenderRole: 'CUSTOMER', unread: 0 },
]

const PROVIDER_CONVERSATIONS = [
  { _id: ID(4), providerId: ID(7), with: { name: 'Ali Plumbing', image: '' }, lastMessageAt: TODAY, lastMessagePreview: 'Friday at 10 works.', lastSenderRole: 'PROVIDER', unread: 1 },
]

const MESSAGES = [
  { _id: ID(3), conversationId: ID(1), senderRole: 'CUSTOMER', mine: true, body: 'Is this in stock?', createdAt: YESTERDAY, product: null },
  { _id: ID(4), conversationId: ID(1), senderRole: 'BRAND', mine: false, body: 'Yes, ships tomorrow.', createdAt: TODAY, product: null },
]

const PRODUCT = { _id: ID(9), name: 'Mehrunisa Printed Lawn', price: 3600, images: [], description: 'A lawn.', attributes: {}, sku: 'LN-1', availability: 'IN_STOCK', quantity: 5, brandId: ID(8) }
const BRAND = { _id: ID(8), name: 'Loom & Co.', logo: '' }

const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } })

// The inbox merges two collections, so each URL answers with its own list.
const mockInbox = ({ store = [], provider = [] } = {}) => {
  api.get.mockImplementation((url) => {
    if (url === '/services/direct-chats') return Promise.resolve({ data: { conversations: provider, pagination: { page: 1, pages: 1 } } })
    if (url === '/chats') return Promise.resolve({ data: { conversations: store, pagination: { page: 1, pages: 1 } } })
    return Promise.resolve({ data: {} })
  })
}

// The product page reads the product, its brand and the reviews summary.
const mockProductApi = () => {
  api.get.mockImplementation((url) => {
    if (url === `/products/${ID(9)}`) return Promise.resolve({ data: { product: PRODUCT } })
    if (url === `/brands/${ID(8)}`) return Promise.resolve({ data: { brand: BRAND } })
    if (url === `/products/${ID(9)}/reviews`) return Promise.resolve({ data: { summary: { count: 0, average: 0 }, reviews: [], pagination: { page: 1, pages: 1 } } })
    return Promise.resolve({ data: {} })
  })
}

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})

describe('conversation list', () => {
  it('shows each conversation with its unread count', async () => {
    mockInbox({ store: CONVERSATIONS })
    const screen = await show(<ChatScreen />, { auth: signedIn() })
    const text = screenText(screen)
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('You: Thanks!')
    // The unread pill is a single digit bubble on the first row only.
    const unreadDigits = screen.root.findAllByType(Text).filter((n) => textOf(n) === '2')
    expect(unreadDigits.length).toBe(1)
  })

  it('re-reads the list when a message arrives over the socket', async () => {
    mockInbox({ store: CONVERSATIONS })
    let listener
    const screen = await show(<ChatScreen />, {
      auth: signedIn(),
      chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }),
    })
    expect(listener).toBeTruthy()
    await act(async () => listener('message', { conversationId: ID(1), message: { _id: ID(5) } }))
    const calls = api.get.mock.calls.filter(([url]) => url === '/chats')
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('merges store and provider chats under one filter bar', async () => {
    mockInbox({ store: CONVERSATIONS, provider: PROVIDER_CONVERSATIONS })
    const screen = await show(<ChatScreen />, { auth: signedIn() })
    const text = screenText(screen)
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('Ali Plumbing')
    // Kind labels only make sense in the merged view.
    expect(text).toContain('Store')
    expect(text).toContain('Service')
    expect(api.get).toHaveBeenCalledWith('/services/direct-chats', { params: { page: 1, limit: 20 } })
  })

  it('filters to service providers and opens a provider thread', async () => {
    mockInbox({ store: CONVERSATIONS, provider: PROVIDER_CONVERSATIONS })
    const screen = await show(<ChatScreen />, { auth: signedIn() })
    api.get.mockClear()
    await press(screen, 'Service providers')

    const text = screenText(screen)
    expect(text).toContain('Ali Plumbing')
    expect(text).not.toContain('Loom & Co.')
    expect(api.get).not.toHaveBeenCalledWith('/chats', expect.anything())
    // When the filter is providers-only the provider list drives paging.
    expect(api.get).toHaveBeenCalledWith('/services/direct-chats', { params: { page: 1, limit: 20 } })

    await press(screen, 'Ali Plumbing')
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: `/chat/${ID(4)}`,
      params: { name: 'Ali Plumbing', canSend: '1', kind: 'provider' },
    })
  })

  it('filters to stores without asking the provider endpoint', async () => {
    mockInbox({ store: CONVERSATIONS, provider: PROVIDER_CONVERSATIONS })
    const screen = await show(<ChatScreen />, { auth: signedIn() })
    api.get.mockClear()
    await press(screen, 'Stores')
    expect(screenText(screen)).toContain('Loom & Co.')
    expect(screenText(screen)).not.toContain('Ali Plumbing')
    expect(api.get).toHaveBeenCalledWith('/chats', { params: { page: 1, limit: 20 } })
    expect(api.get).not.toHaveBeenCalledWith('/services/direct-chats', expect.anything())
  })

  it('says so when there are no conversations yet', async () => {
    mockInbox()
    const screen = await show(<ChatScreen />, { auth: signedIn() })
    expect(screenText(screen)).toContain('No conversations yet')
  })

  it('asks a visitor to sign in first', async () => {
    const screen = await show(<ChatScreen />, { auth: signedOut() })
    expect(screenText(screen)).toContain('Sign in to see your messages')
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('thread', () => {
  beforeEach(() => {
    mockParams = { id: ID(1), name: 'Loom & Co.' }
  })

  const openThread = async () => {
    api.get.mockResolvedValue({ data: { messages: MESSAGES, hasMore: false } })
    api.post.mockResolvedValue({ data: { success: true } })
    return show(<ChatThread />, { auth: signedIn() })
  }

  it('shows the history with day dividers, and reads the thread on open', async () => {
    const screen = await openThread()
    const text = screenText(screen)
    expect(text).toContain('Loom & Co.')
    expect(text).toContain('Is this in stock?')
    expect(text).toContain('Yes, ships tomorrow.')
    expect(text).toContain('Yesterday')
    expect(api.post).toHaveBeenCalledWith(`/chats/${ID(1)}/read`)
  })

  it('sends a message and shows the answer the server returned', async () => {
    const screen = await openThread()
    api.post.mockResolvedValue({ data: { message: { ...MESSAGES[0], _id: ID(6), body: 'Any other colours?', createdAt: TODAY } } })
    await type(screen, 'Message', 'Any other colours?')
    await pressByLabel(screen, 'Send message')
    const text = screenText(screen)
    expect(api.post).toHaveBeenCalledWith(`/chats/${ID(1)}/messages`, { body: 'Any other colours?' })
    expect(text).toContain('Any other colours?')
  })

  it('keeps the draft and explains a failed send', async () => {
    const screen = await openThread()
    api.post.mockRejectedValue(httpError(429, 'Too many messages'))
    await type(screen, 'Message', 'Hello?')
    await pressByLabel(screen, 'Send message')
    expect(screenText(screen)).toContain('Too many messages')
    // The failed draft is still in the box, ready to send again.
    const draft = screen.root.findAll((n) => n.props.accessibilityLabel === 'Message' && typeof n.props.onChangeText === 'function')[0]
    expect(draft.props.value).toBe('Hello?')
  })

  it('appends a live message and reads the thread again', async () => {
    api.get.mockResolvedValue({ data: { messages: MESSAGES, hasMore: false } })
    api.post.mockResolvedValue({ data: { success: true } })
    let listener
    const screen = await show(<ChatThread />, {
      auth: signedIn(),
      chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }),
    })
    await act(async () =>
      listener('message', { conversationId: ID(1), lastMessagePreview: 'Packaging is eco-friendly', message: { _id: ID(7), conversationId: ID(1), senderRole: 'BRAND', mine: false, body: 'Packaging is eco-friendly', createdAt: TODAY, product: null } }),
    )
    expect(screenText(screen)).toContain('Packaging is eco-friendly')
    expect(api.post).toHaveBeenCalledWith(`/chats/${ID(1)}/read`)
  })

  it('ignores a message meant for another conversation', async () => {
    let listener
    const screen = await show(<ChatThread />, {
      auth: signedIn(),
      chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }),
    })
    api.post.mockClear()
    await act(async () => listener('message', { conversationId: ID(2), message: { _id: ID(7), conversationId: ID(2), senderRole: 'BRAND', mine: false, body: 'Other chat', createdAt: TODAY } }))
    expect(screenText(screen)).not.toContain('Other chat')
  })

  it('closes the composer when the seller is not taking messages', async () => {
    mockParams = { id: ID(1), name: 'Loom & Co.', canSend: '0' }
    await openThread()
    const screen = await openThread()
    const text = screenText(screen)
    expect(text).toContain('not taking messages')
    expect(screen.root.findAll((n) => n.props.accessibilityLabel === 'Message').length).toBe(0)
  })

  it('loads earlier messages with the cursor', async () => {
    api.get.mockResolvedValueOnce({ data: { messages: MESSAGES, hasMore: true } })
    api.get.mockResolvedValueOnce({ data: { messages: [{ _id: ID(5), conversationId: ID(1), senderRole: 'BRAND', mine: false, body: 'Welcome to Loom & Co.', createdAt: YESTERDAY, product: null }], hasMore: false } })
    api.post.mockResolvedValue({ data: { success: true } })
    const screen = await show(<ChatThread />, { auth: signedIn() })
    await press(screen, 'Load earlier messages')
    expect(api.get).toHaveBeenLastCalledWith(`/chats/${ID(1)}/messages`, { params: { limit: 30, before: ID(3) } })
    expect(screenText(screen)).toContain('Welcome to Loom & Co.')
  })
})

describe('starting a chat from a product', () => {
  it('starts a new thread with the product attached', async () => {
    mockParams = { product: ID(9) }
    api.get.mockResolvedValue({ data: { product: { _id: ID(9), name: PRODUCT.name, price: 3600, image: '', available: true }, brand: BRAND, conversationId: null } })
    api.post.mockResolvedValue({ data: { conversationId: ID(4), message: { _id: ID(6) } } })
    const screen = await show(<ChatScreen />, { auth: signedIn() })
    expect(screenText(screen)).toContain('Loom & Co.')
    await type(screen, 'Message', 'Do you deliver to Kohistan?')
    await press(screen, 'Send')
    expect(api.post).toHaveBeenCalledWith('/chats/start', { productId: ID(9), body: 'Do you deliver to Kohistan?' })
    expect(mockRouter.replace).toHaveBeenCalledWith(`/chat/${ID(4)}`)
  })

  it('opens the existing thread with that brand straight away', async () => {
    mockParams = { product: ID(9) }
    api.get.mockResolvedValue({ data: { product: { _id: ID(9), name: PRODUCT.name, price: 3600, image: '', available: true }, brand: BRAND, conversationId: ID(1) } })
    await show(<ChatScreen />, { auth: signedIn() })
    expect(mockRouter.replace).toHaveBeenCalledWith(`/chat/${ID(1)}`)
  })

  it('shows the entry point on the product page', async () => {
    mockParams = { id: ID(9) }
    mockProductApi()
    const screen = await show(<ProductScreen />, { auth: signedIn() })
    await press(screen, 'Chat with seller')
    expect(mockRouter.push).toHaveBeenCalledWith(`/chat?product=${ID(9)}`)
  })

  it('sends a visitor to sign in first, and back afterwards', async () => {
    mockParams = { id: ID(9) }
    mockProductApi()
    const screen = await show(<ProductScreen />, { auth: signedOut() })
    await press(screen, 'Chat with seller')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: `/chat?product=${ID(9)}` } })
  })
})

describe('thread with a service provider', () => {
  const PROVIDER_MESSAGES = [
    { _id: ID(3), conversationId: ID(1), senderRole: 'CUSTOMER', mine: true, body: 'Can you come on Friday?', createdAt: YESTERDAY },
    { _id: ID(4), conversationId: ID(1), senderRole: 'PROVIDER', mine: false, body: 'Friday at 10 works.', createdAt: TODAY },
  ]

  beforeEach(() => {
    mockParams = { id: ID(1), name: 'Ali Plumbing', kind: 'provider' }
  })

  const openProviderThread = async (extra = {}) => {
    api.get.mockResolvedValue({ data: { messages: PROVIDER_MESSAGES, hasMore: false } })
    api.post.mockResolvedValue({ data: { success: true } })
    return show(<ChatThread />, { auth: signedIn(), ...extra })
  }

  it('reads the direct-chat thread and marks it read', async () => {
    const screen = await openProviderThread()
    const text = screenText(screen)
    expect(text).toContain('Ali Plumbing')
    expect(text).toContain('Can you come on Friday?')
    expect(text).toContain('Friday at 10 works.')
    expect(api.get).toHaveBeenCalledWith(`/services/direct-chats/${ID(1)}/messages`, { params: { limit: 30 } })
    expect(api.post).toHaveBeenCalledWith(`/services/direct-chats/${ID(1)}/read`)
  })

  it('sends through the provider endpoint', async () => {
    const screen = await openProviderThread()
    api.post.mockResolvedValue({ data: { message: { ...PROVIDER_MESSAGES[0], _id: ID(6), body: 'See you then.', createdAt: TODAY } } })
    await type(screen, 'Message', 'See you then.')
    await pressByLabel(screen, 'Send message')

    expect(api.post).toHaveBeenCalledWith(`/services/direct-chats/${ID(1)}/messages`, { body: 'See you then.' })
    expect(screenText(screen)).toContain('See you then.')
  })

  it('appends a live provider message and reads it straight away', async () => {
    let listener
    const screen = await openProviderThread({ chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }) })
    await act(async () =>
      listener('message', {
        kind: 'PROVIDER',
        conversationId: ID(1),
        message: { _id: ID(7), conversationId: ID(1), senderRole: 'PROVIDER', mine: false, body: 'Running ten minutes late.', createdAt: TODAY },
      }),
    )
    expect(screenText(screen)).toContain('Running ten minutes late.')
    expect(api.post).toHaveBeenCalledWith(`/services/direct-chats/${ID(1)}/read`)
  })

  it('ignores product and booking chat events', async () => {
    let listener
    const screen = await openProviderThread({ chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }) })
    await act(async () => listener('message', { conversationId: ID(1), message: { _id: ID(8), conversationId: ID(1), mine: false, body: 'Booking is confirmed.', createdAt: TODAY } }))
    await act(async () => listener('message', { kind: 'SERVICE_BOOKING', conversationId: ID(1), message: { _id: ID(9), conversationId: ID(1), mine: false, body: 'Your booking moved.', createdAt: TODAY } }))

    const text = screenText(screen)
    expect(text).not.toContain('Booking is confirmed.')
    expect(text).not.toContain('Your booking moved.')
  })

  it('closes the composer when the provider is not taking messages', async () => {
    mockParams = { ...mockParams, canSend: '0' }
    const screen = await openProviderThread()
    expect(screenText(screen)).toContain('This provider is not taking messages right now.')
    expect(screen.root.findAll((n) => n.props.accessibilityLabel === 'Message').length).toBe(0)
  })

  it('invites a question when the thread is still empty', async () => {
    api.get.mockResolvedValue({ data: { messages: [], hasMore: false } })
    api.post.mockResolvedValue({ data: { success: true } })
    const screen = await show(<ChatThread />, { auth: signedIn() })
    expect(screenText(screen)).toContain('Ask Ali Plumbing about the job.')
  })
})

describe('booking thread', () => {
  const BOOKING_ID = ID(11)
  const SERVICE_CONVERSATION = ID(12)
  const BOOKING_MESSAGES = [
    { _id: ID(13), conversationId: SERVICE_CONVERSATION, senderRole: 'SYSTEM', mine: false, body: 'Booking accepted. You can chat here about the job.', createdAt: YESTERDAY },
    { _id: ID(14), conversationId: SERVICE_CONVERSATION, senderRole: 'CUSTOMER', mine: true, body: 'Gate code is 4321.', createdAt: TODAY },
  ]

  beforeEach(() => {
    mockParams = { id: BOOKING_ID, name: 'Ali Plumbing', kind: 'booking' }
  })

  const openBookingThread = async (extra = {}) => {
    api.get.mockResolvedValue({ data: { messages: BOOKING_MESSAGES, hasMore: false } })
    api.post.mockResolvedValue({ data: { success: true } })
    return show(<ChatThread />, { auth: signedIn(), ...extra })
  }

  it('reads the thread by booking id and marks it read', async () => {
    const screen = await openBookingThread()
    expect(screenText(screen)).toContain('Gate code is 4321.')
    expect(api.get).toHaveBeenCalledWith(`/services/chats/${BOOKING_ID}/messages`, { params: { limit: 30 } })
    expect(api.post).toHaveBeenCalledWith(`/services/chats/${BOOKING_ID}/read`)
  })

  it('sends through the booking endpoint and shows the answer', async () => {
    const screen = await openBookingThread()
    api.post.mockResolvedValue({ data: { message: { _id: ID(15), conversationId: SERVICE_CONVERSATION, senderRole: 'CUSTOMER', mine: true, body: 'See you at 4.', createdAt: TODAY } } })
    await type(screen, 'Message', 'See you at 4.')
    await pressByLabel(screen, 'Send message')

    expect(api.post).toHaveBeenCalledWith(`/services/chats/${BOOKING_ID}/messages`, { body: 'See you at 4.' })
    expect(screenText(screen)).toContain('See you at 4.')
  })

  it('appends a live booking message addressed by booking id', async () => {
    let listener
    const screen = await openBookingThread({ chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }) })
    await act(async () =>
      listener('message', {
        kind: 'SERVICE_BOOKING',
        bookingId: BOOKING_ID,
        conversationId: SERVICE_CONVERSATION,
        message: { _id: ID(16), conversationId: SERVICE_CONVERSATION, senderRole: 'PROVIDER', mine: false, body: 'On my way.', createdAt: TODAY },
      }),
    )
    expect(screenText(screen)).toContain('On my way.')
    expect(api.post).toHaveBeenCalledWith(`/services/chats/${BOOKING_ID}/read`)
  })

  it('ignores a booking event for another booking', async () => {
    let listener
    const screen = await openBookingThread({ chat: chatValue({ subscribe: (fn) => { listener = fn; return () => {} } }) })
    await act(async () =>
      listener('message', {
        kind: 'SERVICE_BOOKING',
        bookingId: ID(2),
        conversationId: SERVICE_CONVERSATION,
        message: { _id: ID(17), conversationId: SERVICE_CONVERSATION, senderRole: 'PROVIDER', mine: false, body: 'Other booking', createdAt: TODAY },
      }),
    )
    expect(screenText(screen)).not.toContain('Other booking')
  })

  it('explains when the thread is still closed', async () => {
    mockParams = { ...mockParams, canSend: '0' }
    const screen = await openBookingThread()
    expect(screenText(screen)).toContain('Chat opens once the provider accepts this booking.')
    expect(screen.root.findAll((n) => n.props.accessibilityLabel === 'Message').length).toBe(0)
  })
})
