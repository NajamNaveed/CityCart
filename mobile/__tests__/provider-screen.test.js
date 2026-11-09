/**
 * The public provider page against a fake server: the profile, services,
 * working hours, reviews, the booking entry point and starting a chat.
 */
import React from 'react'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
let mockParams = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
  Link: ({ children }) => children,
}))
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
import ServiceProviderScreen from '../src/app/service/[slug]/index'
import { cleanup, press, screenText, show, signedIn, signedOut } from './helpers/screens'

const ID = (n) => `64b7f0c2a1b2c3d4e5f6070${n}`
const BLOCK = { _id: 'block1', name: 'Gulberg', center: { lat: 31.4, lng: 73.1 } }

const PROVIDER = {
  _id: ID(1),
  displayName: 'Ali Plumbing',
  slug: 'ali-plumbing',
  bio: 'Leaks, taps and bathroom fittings, fixed the same day.',
  avatar: '',
  coverImage: '',
  startingAtPrice: 150000,
  ratingAvg: 4.7,
  ratingCount: 2,
  completedBookings: 30,
  isNew: false,
  category: { _id: 'cat1', name: 'Plumbing' },
  city: { _id: 'c1', name: 'Faisalabad' },
  block: BLOCK,
  offerings: [
    { _id: 'o1', title: 'Tap repair', slug: 'tap-repair', description: 'Washers and cartridges.', images: [], startingAtPrice: 150000, durationMinutes: 60, attributes: {} },
    { _id: 'o2', title: 'Leak fix', slug: 'leak-fix', description: '', images: [], startingAtPrice: 250000, durationMinutes: 90, attributes: {} },
  ],
  availability: {
    isPublished: true,
    windows: [
      { weekday: 1, weekdayName: 'Monday', startMinute: 540, endMinute: 1020, slotMinutes: 60 },
      { weekday: 2, weekdayName: 'Tuesday', startMinute: 540, endMinute: 1020, slotMinutes: 60 },
    ],
    blackoutDates: ['2026-12-25'],
  },
  reviews: [
    { _id: 'r1', rating: 5, reviewerName: 'Sana I.', createdAt: '2026-10-01T10:00:00.000Z', serviceTitle: 'Tap repair', comment: 'Fixed it in an hour.', providerReply: { body: 'Thanks for having us.' } },
  ],
}

const httpError = (status, message) => Object.assign(new Error(message), { response: { status, data: { message } } })

function serve(provider = PROVIDER) {
  api.get.mockImplementation(async (url) => {
    if (url === '/services/providers/ali-plumbing') {
      if (!provider) throw httpError(404, 'Provider not found.')
      return { data: { provider } }
    }
    throw new Error(`unexpected GET ${url}`)
  })
}

afterEach(cleanup)

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { slug: 'ali-plumbing' }
  serve()
})

describe('provider page', () => {
  it('shows the profile, services, hours and reviews', async () => {
    const renderer = await show(<ServiceProviderScreen />)
    const text = screenText(renderer)

    for (const expected of [
      'Plumbing',
      'Ali Plumbing',
      'Serves Gulberg',
      '· Faisalabad',
      '4.7',
      '(2 reviews)',
      '30 completed jobs',
      'Starting at',
      'Rs 1,500',
      'Leaks, taps and bathroom fittings, fixed the same day.',
      '2 services',
      'Tap repair',
      'Washers and cartridges.',
      '1 h',
      'Leak fix',
      'Rs 2,500',
      '1 h 30 min',
      'Monday',
      '9:00 am – 5:00 pm',
      'Not available on 25 Dec 2026.',
      'Sana I. · 1 Oct 2026',
      'Fixed it in an hour.',
      'Ali Plumbing replied: ',
      'Thanks for having us.',
      'Gulberg, Faisalabad',
      'The exact address is shared once a booking is accepted.',
    ]) {
      expect(text).toContain(expected)
    }
    expect(api.get).toHaveBeenCalledWith('/services/providers/ali-plumbing')
  })

  it('says a new provider has no reviews yet', async () => {
    serve({ ...PROVIDER, ratingAvg: 0, ratingCount: 0, reviews: [], isNew: true, completedBookings: 0 })
    const text = screenText(await show(<ServiceProviderScreen />))
    expect(text).toContain('New on CityCart')
    expect(text).toContain('0 completed jobs')
    expect(text).toContain('No reviews yet')
  })

  it('explains when the provider has no published service list', async () => {
    serve({ ...PROVIDER, offerings: [] })
    const text = screenText(await show(<ServiceProviderScreen />))
    expect(text).toContain('This provider has not published a service list yet.')
  })

  it('says when working hours are not published', async () => {
    serve({ ...PROVIDER, availability: { isPublished: false, windows: [], blackoutDates: [] } })
    const text = screenText(await show(<ServiceProviderScreen />))
    expect(text).toContain('No fixed working hours published.')
  })

  it('opens the booking request for a signed-in customer', async () => {
    const renderer = await show(<ServiceProviderScreen />, { auth: signedIn() })
    await press(renderer, 'Request a booking')
    expect(mockRouter.push).toHaveBeenCalledWith('/service/ali-plumbing/book')
  })

  it('sends a visitor to sign in first, then back to the booking form', async () => {
    const renderer = await show(<ServiceProviderScreen />, { auth: signedOut() })
    await press(renderer, 'Sign in to book')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/service/ali-plumbing/book' } })
  })

  it('asks a visitor to sign in before opening a chat', async () => {
    const renderer = await show(<ServiceProviderScreen />, { auth: signedOut() })
    await press(renderer, 'Message Ali Plumbing')
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/login', params: { next: '/service/ali-plumbing' } })
    expect(api.post).not.toHaveBeenCalled()
  })

  it('starts a chat and opens the thread', async () => {
    
    api.post.mockResolvedValue({ data: { conversationId: ID(4), provider: { name: 'Ali Plumbing', image: '', slug: 'ali-plumbing' } } })
    const renderer = await show(<ServiceProviderScreen />, { auth: signedIn() })

    await press(renderer, 'Message Ali Plumbing')
    expect(api.post).toHaveBeenCalledWith('/services/direct-chats/start', { providerId: PROVIDER._id })
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: `/chat/${ID(4)}`,
      params: { kind: 'provider', name: 'Ali Plumbing' },
    })
  })

  it('explains a chat that could not be opened', async () => {
    
    api.post.mockRejectedValue(httpError(503, 'Chat is waking up.'))
    const renderer = await show(<ServiceProviderScreen />, { auth: signedIn() })

    await press(renderer, 'Message Ali Plumbing')
    expect(screenText(renderer)).toContain('Chat is waking up.')
    expect(mockRouter.push).not.toHaveBeenCalled()
  })

  it('tells a seller account that only customers can book', async () => {
    
    const renderer = await show(<ServiceProviderScreen />, { auth: signedIn({ id: 'u2', name: 'Loom & Co.', role: 'BRAND_ADMIN' }) })
    const text = screenText(renderer)
    expect(text).toContain('Only customer accounts can book a service.')
    expect(text).not.toContain('Ask a question')
  })

  it('offers other providers when the page is gone', async () => {
    serve(null)
    const renderer = await show(<ServiceProviderScreen />)
    expect(screenText(renderer)).toContain('Provider not found')

    await press(renderer, 'Browse services')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/services')
  })

  it('offers to try again when the page cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Database is busy.'))
    const renderer = await show(<ServiceProviderScreen />)
    expect(screenText(renderer)).toContain("Couldn't load this provider")
    expect(screenText(renderer)).toContain('Database is busy.')

    serve()
    await press(renderer, 'Try again')
    expect(screenText(renderer)).toContain('Ali Plumbing')
  })

  it('links back to the services list', async () => {
    const renderer = await show(<ServiceProviderScreen />)
    await press(renderer, 'Browse more providers')
    expect(mockRouter.navigate).toHaveBeenCalledWith('/services')
  })
})
