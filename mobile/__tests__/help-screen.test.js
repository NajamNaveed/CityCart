/**
 * Help & support: the support address comes from the public settings, the FAQ
 * expands in place, topic rows open the right screen, and the account tab has
 * a way in (signed in or not).
 */
import React from 'react'
import { Linking } from 'react-native'

jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() }
  return { __router: mockRouter, useRouter: () => mockRouter, useLocalSearchParams: () => ({}), Redirect: () => null, Link: ({ children }) => children }
})
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getErrorMessage: (e, fallback) => e?.message || fallback,
  getFieldErrors: () => ({}),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import { resetPublicSettings } from '../src/services/settings'
import Account from '../src/app/(tabs)/account'
import Help from '../src/app/help'
import { cleanup, press, screenText, show, signedIn } from './helpers/screens'

const { __router: router } = jest.requireMock('expo-router')

const SUPPORT = { platformName: 'CityCart', supportEmail: 'help@citycart.pk', supportPhone: '+92 300 1112222' }

beforeEach(() => {
  jest.clearAllMocks()
  resetPublicSettings()
  api.get.mockResolvedValue({ data: { settings: SUPPORT } })
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
})

afterEach(cleanup)

describe('Help & support', () => {
  it('shows the support address and phone from the public settings', async () => {
    const renderer = await show(<Help />)
    const text = screenText(renderer)

    expect(api.get).toHaveBeenCalledWith('/settings/public')
    expect(text).toContain('Write to the support team')
    expect(text).toContain('help@citycart.pk')
    expect(text).toContain('Call +92 300 1112222')
    expect(text).toContain('My orders')
    expect(text).toContain('My bookings')
    expect(text).toContain('How does cash on delivery work?')
  })

  it('opens the mail and phone apps from the support card', async () => {
    const renderer = await show(<Help />)

    await press(renderer, 'Email support')
    expect(Linking.openURL).toHaveBeenCalledWith('mailto:help@citycart.pk')

    await press(renderer, 'Call +92 300 1112222')
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+923001112222')
  })

  it('expands an answer in place and folds it again', async () => {
    const renderer = await show(<Help />)
    const answer = 'You pay the rider in cash at your door.'
    expect(screenText(renderer)).not.toContain(answer)

    await press(renderer, 'How does cash on delivery work?')
    expect(screenText(renderer)).toContain(answer)

    await press(renderer, 'How does cash on delivery work?')
    expect(screenText(renderer)).not.toContain(answer)
  })

  it('sends the shopper to their orders and bookings', async () => {
    const renderer = await show(<Help />)

    await press(renderer, 'My bookings')
    expect(router.push).toHaveBeenCalledWith('/bookings')
  })

  it('asks for an order number when the support address is not set up', async () => {
    api.get.mockResolvedValue({ data: { settings: { platformName: 'CityCart' } } })
    const renderer = await show(<Help />)

    const text = screenText(renderer)
    expect(text).toContain('The public support address is being set up.')
    expect(text).not.toContain('Email support')
    expect(text).not.toContain('Call ')
  })

  it('is reachable from the account tab, signed in or not', async () => {
    const signedOutView = await show(<Account />)
    expect(screenText(signedOutView)).toContain('Help & support')
    await press(signedOutView, 'Help & support')
    expect(router.push).toHaveBeenCalledWith('/help')

    router.push.mockClear()
    const signedInView = await show(<Account />, { auth: signedIn() })
    await press(signedInView, 'Help & support')
    expect(router.push).toHaveBeenCalledWith('/help')
  })
})
