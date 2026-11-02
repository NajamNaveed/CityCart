/**
 * The Staff app's screens against a fake server: sign-in, who goes where, and
 * which role may open which screens. The picker and records screens have their
 * own test files.
 */
import React from 'react'

jest.setTimeout(30000)

const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
let mockParams = {}

jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    // Like the real one, it runs again whenever it is given a NEW callback: that is what made an un-memoized callback loop on a phone.
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
    // A redirect shows where it points, so a test can read it.
    Redirect: ({ href }) => <Text>{`redirect:${href}`}</Text>,
    Link: ({ children }) => children,
    Tabs: Object.assign(() => null, { Screen: () => null }),
    Stack: () => null,
  }
})
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x' }))
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  getErrorMessage: (e, fallback) => e?.response?.data?.message || e?.message || fallback || 'Something went wrong.',
  getFieldErrors: (e) => Object.fromEntries((e?.response?.data?.errors || []).map((x) => [x.field, x.message])),
  setUnauthorizedHandler: jest.fn(),
}))

import api from '../src/services/api'
import Start from '../src/app/index'
import Login from '../src/app/(auth)/login'
import OrderScreen from '../src/app/order/[id]'
import PickerTabs from '../src/app/(picker)/_layout'
import { cleanup, EMPLOYEE, isDisabled, PICKER, press, screenText, show, signedIn, signedOut, type } from './helpers/screens'

const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } })

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  mockRouter.canGoBack.mockReturnValue(true)
})
afterEach(cleanup)

describe('the start screen sends each person where they belong', () => {
  it.each([
    ['signed out', signedOut(), 'redirect:/login'],
    ['a picker', signedIn(PICKER), 'redirect:/queue'],
    ['a team member', signedIn(EMPLOYEE), 'redirect:/overview'],
  ])('%s', async (_name, auth, expected) => {
    const screen = await show(<Start />, { auth })
    expect(screenText(screen)).toBe(expected)
  })
})

describe('sign-in', () => {
  it('asks for an email and password before calling the server', async () => {
    const auth = signedOut()
    const screen = await show(<Login />, { auth })
    await press(screen, 'Sign in')
    expect(screenText(screen)).toMatch(/Enter a valid email address/)
    expect(screenText(screen)).toMatch(/Enter your password/)
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('signs in with a tidy lower-case email', async () => {
    const auth = signedOut()
    auth.login.mockResolvedValue(EMPLOYEE)
    const screen = await show(<Login />, { auth })
    await type(screen, 'Email', '  Hira@Example.com ')
    await type(screen, 'Password', 'correcthorse123')
    await press(screen, 'Sign in')
    expect(auth.login).toHaveBeenCalledWith({ email: 'hira@example.com', password: 'correcthorse123' })
  })

  it("shows the server's reason when it fails, and lets the person try again", async () => {
    const auth = signedOut()
    auth.login.mockRejectedValue(httpError(401, { message: 'Invalid email or password.' }))
    const screen = await show(<Login />, { auth })
    await type(screen, 'Email', 'hira@example.com')
    await type(screen, 'Password', 'wrong')
    await press(screen, 'Sign in')
    expect(screenText(screen)).toMatch(/Invalid email or password/)
    expect(isDisabled(screen, 'Sign in')).toBe(false)
  })

  it('says so when the server could not be reached at start', async () => {
    const screen = await show(<Login />, { auth: signedOut(true) })
    expect(screenText(screen)).toMatch(/Cannot reach the server/)
  })

  it('goes straight on when already signed in, and says how to reset a password', async () => {
    expect(screenText(await show(<Login />, { auth: signedIn() }))).toBe('redirect:/')
    expect(screenText(await show(<Login />, { auth: signedOut() }))).toMatch(/Ask your brand to reset it/)
  })
})

describe('who may see which screens', () => {
  it('a picker cannot open the records screens, and a team member cannot open the picker screens', async () => {
    mockParams = { id: 'o1' }
    expect(screenText(await show(<OrderScreen />, { auth: signedIn(PICKER) }))).toBe('redirect:/')
    expect(screenText(await show(<PickerTabs />, { auth: signedIn(EMPLOYEE) }))).toBe('redirect:/')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('signed-out visitors are sent to sign in', async () => {
    mockParams = { id: 'o1' }
    expect(screenText(await show(<OrderScreen />, { auth: signedOut() }))).toBe('redirect:/login')
    expect(screenText(await show(<PickerTabs />, { auth: signedOut() }))).toBe('redirect:/login')
  })
})
