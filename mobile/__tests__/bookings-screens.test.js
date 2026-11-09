/**
 * The shopper's bookings against a fake server: the filtered list, the detail
 * summary, and every action the server allows a customer to take.
 */
import React from 'react'
import { Alert } from 'react-native'
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
import BookingsListScreen from '../src/app/bookings/index'
import BookingScreen from '../src/app/bookings/[id]'
import { cleanup, press, pressByLabel, screenText, show, signedIn, signedOut, type } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const NOW = new Date().toISOString()
const TOMORROW = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

const BASE = {
  _id: ID(1),
  bookingNumber: 'BK-0001',
  status: 'REQUESTED',
  requestedStart: TOMORROW,
  scheduledStart: null,
  createdAt: NOW,
  customerOfferPaisa: 300000,
  note: 'Please bring a ladder.',
  canChat: false,
  canCancel: true,
  unread: 0,
  offering: { title: 'Leak repair', image: '', durationMinutes: 90, startingAtPrice: 250000 },
  provider: { displayName: 'Ali Plumbing', slug: 'ali-plumbing', avatar: '', phone: '0300 1234567' },
  address: { addressLine: 'House 4, Street 2', blockName: 'Block B', city: 'Karachi' },
  events: [
    { type: 'REQUESTED', at: NOW, byRole: 'CUSTOMER' },
    { type: 'OFFER_ACCEPTED', at: NOW, byRole: 'PROVIDER', note: 'Price confirmed' },
  ],
}

const BOOKINGS = [BASE, { ...BASE, _id: ID(2), bookingNumber: 'BK-0002', status: 'ACCEPTED', canChat: true, scheduledStart: TOMORROW, agreedPricePaisa: 400000 }]

const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } })

const mockBookings = (rows = BOOKINGS) => {
  api.get.mockImplementation((url, config) => {
    if (url === '/services/bookings') {
      const status = config?.params?.status
      const items = status ? rows.filter((b) => b.status === status) : rows
      return Promise.resolve({ data: { bookings: items, pagination: { page: 1, pages: 1, total: items.length } } })
    }
    return Promise.resolve({ data: {} })
  })
}

const openDetail = async (booking, extra = {}) => {
  mockParams = { id: booking._id }
  api.get.mockResolvedValue({ data: { booking } })
  api.post.mockResolvedValue({ data: { success: true } })
  return show(<BookingScreen />, { auth: signedIn(), ...extra })
}

const confirmFromAlert = async (spy, buttonText) => {
  const button = spy.mock.calls[0][2].find((b) => b.text === buttonText)
  await act(async () => button.onPress())
}

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})

describe('bookings list', () => {
  it('shows bookings with their status, provider and price', async () => {
    mockBookings()
    const screen = await show(<BookingsListScreen />, { auth: signedIn() })
    const text = screenText(screen)
    expect(text).toContain('Leak repair')
    expect(text).toContain('Ali Plumbing · BK-0001')
    expect(text).toContain('Rs 3,000')
    expect(text).toContain('Requested')
  })

  it('filters by status on the server', async () => {
    mockBookings()
    const screen = await show(<BookingsListScreen />, { auth: signedIn() })
    await pressByLabel(screen, 'Filter Accepted')
    expect(api.get).toHaveBeenLastCalledWith('/services/bookings', { params: { limit: 10, page: 1, status: 'ACCEPTED' } })
    expect(screenText(screen)).toContain('BK-0002')
    expect(screenText(screen)).not.toContain('BK-0001')
  })

  it('opens a booking when its row is pressed', async () => {
    mockBookings()
    const screen = await show(<BookingsListScreen />, { auth: signedIn() })
    await press(screen, 'Leak repair')
    expect(mockRouter.push).toHaveBeenCalledWith(`/bookings/${ID(1)}`)
  })

  it('invites the first booking when there are none', async () => {
    mockBookings([])
    const screen = await show(<BookingsListScreen />, { auth: signedIn() })
    expect(screenText(screen)).toContain('No bookings yet')
  })

  it('asks a visitor to sign in first', async () => {
    const screen = await show(<BookingsListScreen />, { auth: signedOut() })
    expect(screenText(screen)).toContain('Sign in to see your bookings')
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('booking detail', () => {
  it('shows the request, the price and the history', async () => {
    const screen = await openDetail(BASE)
    const text = screenText(screen)
    expect(text).toContain('Booking BK-0001')
    expect(text).toContain('Leak repair')
    expect(text).toContain('Ali Plumbing')
    expect(text).toContain('Your offer')
    expect(text).toContain('Please bring a ladder.')
    expect(text).toContain('Request sent')
    expect(text).toContain('Your offer accepted')
    expect(text).toContain('Chat opens when the provider accepts')
  })

  it('opens the booking chat once it is open', async () => {
    const booking = { ...BASE, status: 'ACCEPTED', canChat: true, unread: 2 }
    const screen = await openDetail(booking)
    await press(screen, 'Open chat (2 new)')
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: `/chat/${ID(1)}`,
      params: { kind: 'booking', name: 'Ali Plumbing' },
    })
  })

  it('accepts a proposal and shows the new booking', async () => {
    const proposed = {
      ...BASE,
      status: 'PROPOSED',
      activeProposal: { pricePaisa: 350000, scope: 'Parts and labour included.', scheduledStart: TOMORROW, expiresAt: TOMORROW },
    }
    const screen = await openDetail(proposed)
    expect(screenText(screen)).toContain('Rs 3,500')
    api.post.mockResolvedValue({
      data: { booking: { ...BASE, status: 'ACCEPTED', canChat: true, scheduledStart: TOMORROW, agreedPricePaisa: 350000 } },
    })
    await press(screen, 'Accept this price')
    expect(api.post).toHaveBeenCalledWith(`/services/bookings/${ID(1)}/proposals/accept`)
    expect(screenText(screen)).toContain('Proposal accepted')
  })

  it('declines a proposal after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const proposed = { ...BASE, status: 'PROPOSED', activeProposal: { pricePaisa: 350000, scope: 'Scope.', scheduledStart: TOMORROW, expiresAt: TOMORROW } }
    const screen = await openDetail(proposed)
    await press(screen, 'Decline')
    expect(alertSpy).toHaveBeenCalledWith('Decline this proposal?', 'The provider is told and the booking closes.', expect.any(Array))
    api.post.mockResolvedValue({ data: { booking: { ...BASE, status: 'DECLINED' } } })
    await confirmFromAlert(alertSpy, 'Decline')
    expect(api.post).toHaveBeenCalledWith(`/services/bookings/${ID(1)}/proposals/decline`)
    expect(screenText(screen)).toContain('Proposal declined')
  })

  it('confirms a completed job after the alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const completed = { ...BASE, status: 'COMPLETED', canChat: true, canCancel: false, finalAmountPaisa: 450000 }
    const screen = await openDetail(completed)
    expect(screenText(screen)).toContain('Rs 4,500')
    await press(screen, 'Confirm the job is done')
    api.post.mockResolvedValue({ data: { booking: { ...completed, status: 'CONFIRMED', confirmedAt: NOW, confirmedBy: 'CUSTOMER' } } })
    await confirmFromAlert(alertSpy, 'Confirm')
    expect(api.post).toHaveBeenCalledWith(`/services/bookings/${ID(1)}/confirm`)
    expect(screenText(screen)).toContain('Job confirmed')
  })

  it('reports a problem with a reason', async () => {
    const completed = { ...BASE, status: 'COMPLETED', canChat: true, canCancel: false, finalAmountPaisa: 450000 }
    const screen = await openDetail(completed)
    await press(screen, 'Report a problem')
    await type(screen, 'What went wrong?', 'The tap still leaks.')
    api.post.mockResolvedValue({ data: { booking: { ...completed, status: 'DISPUTED' } } })
    await press(screen, 'Send dispute to CityCart')
    expect(api.post).toHaveBeenCalledWith(`/services/bookings/${ID(1)}/dispute`, { reason: 'The tap still leaks.' })
    expect(screenText(screen)).toContain('CityCart is reviewing your dispute')
  })

  it('posts a review once confirmed', async () => {
    const confirmed = { ...BASE, status: 'CONFIRMED', canChat: true, canCancel: false, confirmedAt: NOW, confirmedBy: 'CUSTOMER' }
    const screen = await openDetail(confirmed)
    await pressByLabel(screen, '4 stars')
    await type(screen, 'Comment (optional)', 'Quick and tidy.')
    api.post.mockResolvedValue({ data: { review: { rating: 4, comment: 'Quick and tidy.' } } })
    await press(screen, 'Post review')
    expect(api.post).toHaveBeenCalledWith(`/services/bookings/${ID(1)}/review`, { rating: 4, comment: 'Quick and tidy.' })
    expect(screenText(screen)).toContain('your review is now on the provider')
  })

  it('cancels a booking with a reason', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const screen = await openDetail(BASE)
    await press(screen, 'Cancel this booking')
    await type(screen, 'Why are you cancelling?', 'Plumber found the leak.')
    await press(screen, 'Yes, cancel it')
    expect(alertSpy).toHaveBeenCalledWith('Cancel this booking?', 'This cannot be undone.', expect.any(Array))
    api.post.mockResolvedValue({ data: { booking: { ...BASE, status: 'CANCELLED', canCancel: false } } })
    await confirmFromAlert(alertSpy, 'Cancel it')
    expect(api.post).toHaveBeenCalledWith(`/services/bookings/${ID(1)}/cancel`, { reason: 'Plumber found the leak.' })
    expect(screenText(screen)).toContain('Booking cancelled')
  })

  it('explains a missing booking and offers the list', async () => {
    mockParams = { id: ID(9) }
    api.get.mockRejectedValue(httpError(404, 'Booking not found.'))
    const screen = await show(<BookingScreen />, { auth: signedIn() })
    expect(screenText(screen)).toContain('Booking not found')
    await press(screen, 'My bookings')
    expect(mockRouter.replace).toHaveBeenCalledWith('/bookings')
  })

  it('asks a visitor to sign in first', async () => {
    mockParams = { id: ID(1) }
    const screen = await show(<BookingScreen />, { auth: signedOut() })
    expect(screenText(screen)).toContain('Sign in to see this booking')
    expect(api.get).not.toHaveBeenCalled()
  })
})
