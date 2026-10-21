jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }))

jest.mock('../src/services/config', () => ({ __esModule: true, get API_URL() { return mockApiUrl }, apiIsInsecure: false }))
jest.mock('../src/services/storage', () => ({ __esModule: true, tokenStore: { get: jest.fn(() => mockToken), load: jest.fn(), set: jest.fn(), clear: jest.fn() } }))
jest.mock('socket.io-client', () => ({ __esModule: true, io: jest.fn(() => mockSocket) }))

import api from '../src/services/api'
import { io } from 'socket.io-client'
import { cleanMessageBody, fetchChatUnreadCount, fetchConversations, fetchMessages, fetchProductChat, markConversationRead, sendMessage, startChat } from '../src/services/chats'
import { closeLiveConnection, createLiveConnection, serverOrigin } from '../src/services/socket'
import { clockTime, dayLabel, initialOf, listTime, MAX_MESSAGE_LENGTH } from '../src/utils/chat'

let mockApiUrl = 'https://citycart-api.onrender.com/api/v1'
let mockToken = 'tok'
const mockSocket = { on: jest.fn(), disconnect: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  mockApiUrl = 'https://citycart-api.onrender.com/api/v1'
  mockToken = 'tok'
})

describe('chat requests', () => {
  it('lists conversations page by page', async () => {
    api.get.mockResolvedValue({ data: { conversations: [{ _id: 'c1' }], pagination: { page: 1, pages: 2 } } })
    const { items, pagination } = await fetchConversations(2)
    expect(api.get).toHaveBeenCalledWith('/chats', { params: { page: 2, limit: 20 } })
    expect(items).toEqual([{ _id: 'c1' }])
    expect(pagination.pages).toBe(2)
  })

  it('reads the global unread badge', async () => {
    api.get.mockResolvedValue({ data: { unread: 4 } })
    expect(await fetchChatUnreadCount()).toBe(4)
    api.get.mockResolvedValue({ data: {} })
    expect(await fetchChatUnreadCount()).toBe(0)
  })

  it('asks for the product chat context', async () => {
    api.get.mockResolvedValue({ data: { product: { _id: 'p1' }, brand: { _id: 'b1' }, conversationId: null } })
    const context = await fetchProductChat('p1')
    expect(api.get).toHaveBeenCalledWith('/chats/product/p1')
    expect(context.brand._id).toBe('b1')
  })

  it('starts a thread from a product; the server derives the brand', async () => {
    api.post.mockResolvedValue({ data: { conversationId: 'c9', message: { _id: 'm1' } } })
    const result = await startChat({ productId: 'p1', body: 'Hello!' })
    expect(api.post).toHaveBeenCalledWith('/chats/start', { productId: 'p1', body: 'Hello!' })
    expect(result.conversationId).toBe('c9')
  })

  it('pages message history backwards with the `before` cursor', async () => {
    api.get.mockResolvedValue({ data: { messages: [{ _id: 'm1' }], hasMore: true } })
    const first = await fetchMessages('c1')
    expect(api.get).toHaveBeenCalledWith('/chats/c1/messages', { params: { limit: 30 } })
    expect(first.hasMore).toBe(true)

    await fetchMessages('c1', { before: 'm0' })
    expect(api.get).toHaveBeenCalledWith('/chats/c1/messages', { params: { limit: 30, before: 'm0' } })
  })

  it('sends a message and marks the thread read', async () => {
    api.post.mockResolvedValue({ data: { message: { _id: 'm2' } } })
    expect(await sendMessage('c1', 'Hi')).toEqual({ _id: 'm2' })
    expect(api.post).toHaveBeenCalledWith('/chats/c1/messages', { body: 'Hi' })
    await markConversationRead('c1')
    expect(api.post).toHaveBeenCalledWith('/chats/c1/read')
  })

  it('refuses to send whitespace, keeps inner newlines', () => {
    expect(cleanMessageBody('   \n  ')).toBe('')
    expect(cleanMessageBody('  one\ntwo  ')).toBe('one\ntwo')
    expect(cleanMessageBody(undefined)).toBe('')
  })
})

describe('the live connection', () => {
  it('points the socket at the API origin, token in the handshake auth', () => {
    expect(serverOrigin()).toBe('https://citycart-api.onrender.com')
    expect(createLiveConnection('tok')).toBe(mockSocket)
    expect(io).toHaveBeenCalledWith('https://citycart-api.onrender.com', { auth: { token: 'tok' } })
    closeLiveConnection(mockSocket)
    expect(mockSocket.disconnect).toHaveBeenCalled()
  })

  it('reads the stored token itself when none is given', () => {
    createLiveConnection()
    expect(io).toHaveBeenCalledWith('https://citycart-api.onrender.com', { auth: { token: 'tok' } })
  })

  it('connects to nothing when unconfigured or signed out', () => {
    mockApiUrl = ''
    expect(serverOrigin()).toBe(null)
    expect(createLiveConnection('tok')).toBe(null)
    mockApiUrl = 'https://citycart-api.onrender.com/api/v1'
    mockToken = null
    expect(createLiveConnection()).toBe(null)
    expect(io).not.toHaveBeenCalled()
  })
})

describe('chat time stamps', () => {
  it('names the day of a message: today, yesterday, then the date', () => {
    expect(dayLabel(new Date())).toBe('Today')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(dayLabel(yesterday)).toBe('Yesterday')
    const old = new Date()
    old.setDate(old.getDate() - 400)
    expect(dayLabel(old)).toMatch(/\d/)
  })

  it('gives an invalid date nothing to show', () => {
    expect(dayLabel('nope')).toBe('')
    expect(listTime('nope')).toBe('')
  })

  it('shows the clock time for a list stamp on the same day, the day otherwise', () => {
    const now = new Date()
    expect(listTime(now)).toBe(clockTime(now))
    const old = new Date()
    old.setDate(old.getDate() - 3)
    expect(listTime(old)).toBe(dayLabel(old))
  })

  it('takes the first letter of a name for the monogram', () => {
    expect(initialOf('Loom & Co.')).toBe('L')
    expect(initialOf('  ')).toBe('?')
    expect(initialOf()).toBe('?')
  })

  it('allows a thousand characters, like the server', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(1000)
  })
})
