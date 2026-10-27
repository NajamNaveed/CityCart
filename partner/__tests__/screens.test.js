/**
 * The Partner app's screens against a fake server: sign-in, who goes where,
 * the rider's deliveries, one delivery (status moves, the customer's code, a
 * failed attempt), cash and alerts.
 */
import React from 'react'
import { Linking } from 'react-native'

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
    Tabs: () => null,
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
import Deliveries from '../src/app/(rider)/deliveries'
import Cash from '../src/app/(rider)/cash'
import Alerts from '../src/app/(rider)/alerts'
import Account from '../src/app/(rider)/account'
import OrderScreen from '../src/app/order/[id]'
import DeliveryScreen from '../src/app/delivery/[id]'
import { cleanup, EMPLOYEE, has, isDisabled, press, pressByLabel, RIDER, screenText, show, signedIn, signedOut, tick, type } from './helpers/screens'

const NOW = new Date().toISOString()
const ADDRESS = { name: 'Sana Iqbal', phone: '+92 300 1112223', address: 'House 5, Street 2', city: 'Faisalabad', postalCode: '38000', additionalInstructions: 'Blue gate' }
const delivery = (over = {}) => ({
  _id: 'd1', orderNumber: 'CC-2026-000042', status: 'OUT_FOR_DELIVERY', failureReason: undefined, assignedAt: NOW, updatedAt: NOW,
  address: ADDRESS, items: [{ productName: 'Printed lawn suit', quantity: 2 }], paymentMethod: 'COD', amountToCollect: 2450, cashCollected: false, currency: 'PKR', ...over,
})
const httpError = (status, data = {}) => Object.assign(new Error('http'), { response: { status, data } })
const page = (items) => ({ data: { deliveries: items, pagination: { page: 1, pages: 1, total: items.length } } })

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  mockRouter.canGoBack.mockReturnValue(true)
})
afterEach(cleanup)

describe('the start screen sends each person where they belong', () => {
  it.each([
    ['signed out', signedOut(), 'redirect:/login'],
    ['a rider', signedIn(RIDER), 'redirect:/deliveries'],
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
    auth.login.mockResolvedValue(RIDER)
    const screen = await show(<Login />, { auth })
    await type(screen, 'Email', '  Bilal@Example.com ')
    await type(screen, 'Password', 'correcthorse123')
    await press(screen, 'Sign in')
    expect(auth.login).toHaveBeenCalledWith({ email: 'bilal@example.com', password: 'correcthorse123' })
  })

  it("shows the server's reason when it fails, and lets the rider try again", async () => {
    const auth = signedOut()
    auth.login.mockRejectedValue(httpError(401, { message: 'Invalid email or password.' }))
    const screen = await show(<Login />, { auth })
    await type(screen, 'Email', 'bilal@example.com')
    await type(screen, 'Password', 'wrong')
    await press(screen, 'Sign in')
    expect(screenText(screen)).toMatch(/Invalid email or password/)
    expect(isDisabled(screen, 'Sign in')).toBe(false)
  })

  it('says so when the server could not be reached at start', async () => {
    const screen = await show(<Login />, { auth: signedOut(true) })
    expect(screenText(screen)).toMatch(/Cannot reach the server/)
  })

  it('goes straight on when already signed in, and tells riders how to reset a password', async () => {
    expect(screenText(await show(<Login />, { auth: signedIn() }))).toBe('redirect:/')
    expect(screenText(await show(<Login />, { auth: signedOut() }))).toMatch(/Ask your brand to reset it/)
  })
})

describe('who may see which screens', () => {
  it('a rider cannot open the records screens, and a team member cannot open rider screens', async () => {
    mockParams = { id: 'o1' }
    expect(screenText(await show(<OrderScreen />, { auth: signedIn(RIDER) }))).toBe('redirect:/')
    mockParams = { id: 'd1' }
    expect(screenText(await show(<DeliveryScreen />, { auth: signedIn(EMPLOYEE) }))).toBe('redirect:/')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('signed-out visitors are sent to sign in', async () => {
    mockParams = { id: 'd1' }
    expect(screenText(await show(<DeliveryScreen />, { auth: signedOut() }))).toBe('redirect:/login')
    mockParams = { id: 'o1' }
    expect(screenText(await show(<OrderScreen />, { auth: signedOut() }))).toBe('redirect:/login')
  })
})

describe('the rider\'s deliveries', () => {
  it('lists them with where to and how much cash to collect, and opens one', async () => {
    api.get.mockResolvedValue(page([delivery(), delivery({ _id: 'd2', orderNumber: 'CC-2026-000043', amountToCollect: 0, cashCollected: false, paymentMethod: 'CARD' })]))
    const screen = await show(<Deliveries />)

    expect(api.get).toHaveBeenCalledWith('/rider/deliveries', { params: { scope: 'active', page: 1, limit: 20 } })
    const text = screenText(screen)
    expect(text).toMatch(/CC-2026-000042/)
    expect(text).toMatch(/Sana Iqbal/)
    expect(text).toMatch(/House 5, Street 2, Faisalabad/)
    expect(text).toMatch(/Collect Rs 2,450/)
    expect(text).toMatch(/Paid online/)

    await pressByLabel(screen, 'Order CC-2026-000042')
    expect(mockRouter.push).toHaveBeenCalledWith('/delivery/d1')
  })

  it('loads the list once when it opens (no refresh loop)', async () => {
    api.get.mockResolvedValue(page([delivery()]))
    await show(<Deliveries />)
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('has a friendly empty state', async () => {
    api.get.mockResolvedValue(page([]))
    expect(screenText(await show(<Deliveries />))).toMatch(/Nothing to deliver/)
  })

  it('shows the error and tries again', async () => {
    api.get.mockRejectedValueOnce(httpError(500, { message: 'Server error' }))
    const screen = await show(<Deliveries />)
    expect(screenText(screen)).toMatch(/Couldn't load your deliveries/)
    api.get.mockResolvedValue(page([delivery()]))
    await press(screen, 'Try again')
    expect(screenText(screen)).toMatch(/CC-2026-000042/)
  })

  it('switches to the finished ones, which no longer show the customer', async () => {
    api.get.mockResolvedValue(page([delivery()]))
    const screen = await show(<Deliveries />)
    api.get.mockResolvedValue(page([delivery({ _id: 'd9', orderNumber: 'CC-2026-000007', status: 'DELIVERED', address: null, items: [], amountToCollect: 0, cashCollected: true })]))
    await press(screen, 'Finished')

    expect(api.get).toHaveBeenLastCalledWith('/rider/deliveries', { params: { scope: 'history', page: 1, limit: 20 } })
    expect(screenText(screen)).toMatch(/CC-2026-000007/)
    expect(screenText(screen)).toMatch(/Delivery closed/)
    expect(screenText(screen)).toMatch(/Cash collected/)
    expect(screenText(screen)).not.toMatch(/Sana Iqbal/)
  })
})

describe('one delivery', () => {
  const open = async (d = delivery()) => {
    mockParams = { id: d._id }
    api.get.mockResolvedValue({ data: { delivery: d } })
    return show(<DeliveryScreen />)
  }

  it('shows who to deliver to, the note, the items and the cash to collect', async () => {
    const screen = await open()
    expect(api.get).toHaveBeenCalledWith('/rider/deliveries/d1')
    const text = screenText(screen)
    expect(text).toMatch(/Sana Iqbal/)
    expect(text).toMatch(/House 5, Street 2, Faisalabad/)
    expect(text).toMatch(/Note: Blue gate/)
    expect(text).toMatch(/2 × Printed lawn suit/)
    expect(text).toMatch(/Collect in cash/)
    expect(text).toMatch(/Rs 2,450/)
  })

  it('calls the customer and opens the map with plain links', async () => {
    const open_ = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    const screen = await open()
    await press(screen, 'Call')
    expect(open_).toHaveBeenLastCalledWith('tel:+923001112223')
    await press(screen, 'Open in Maps')
    expect(open_.mock.calls[1][0]).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=House/)
    open_.mockRestore()
  })

  it('says so, calmly, if the phone cannot open the link', async () => {
    const open_ = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no app'))
    const screen = await open()
    await press(screen, 'Call')
    expect(screenText(screen)).toMatch(/Could not open that on this phone/)
    open_.mockRestore()
  })

  it('moves a ready delivery to picked up, using the rider endpoint, and shows the answer', async () => {
    const screen = await open(delivery({ status: 'READY_FOR_PICKUP' }))
    expect(has(screen, 'Enter code to complete')).toBe(false) // not at the door yet
    api.patch.mockResolvedValue({ data: { delivery: delivery({ status: 'PICKED_UP' }) } })

    await press(screen, 'Picked up')

    expect(api.patch).toHaveBeenCalledWith('/rider/deliveries/d1/status', { status: 'PICKED_UP' })
    expect(screenText(screen)).toMatch(/Marked as picked up/)
    expect(has(screen, 'Out for delivery')).toBe(true) // the one next step appears
    expect(has(screen, 'On the way')).toBe(false) // no duplicate step
    expect(has(screen, 'Picked up')).toBe(false)
  })

  it('shows the server\'s reason if a move is refused', async () => {
    const screen = await open(delivery({ status: 'READY_FOR_PICKUP' }))
    api.patch.mockRejectedValue(httpError(409, { message: 'Cannot change a delivery from READY_FOR_PICKUP to PICKED_UP.' }))
    await press(screen, 'Picked up')
    expect(screenText(screen)).toMatch(/Cannot change a delivery/)
  })

  describe('at the door: the customer\'s code', () => {
    it('needs six digits before it can be sent, and keeps only digits', async () => {
      const screen = await open()
      await press(screen, 'Enter code to complete')
      expect(isDisabled(screen, 'Complete delivery')).toBe(true)
      await type(screen, "Customer's delivery code", '48a2 91')
      expect(isDisabled(screen, 'Complete delivery')).toBe(true) // 48291 is only five digits
      await type(screen, "Customer's delivery code", '482913')
      expect(isDisabled(screen, 'Complete delivery')).toBe(false)
    })

    it('completes the delivery with the right code and closes it', async () => {
      const screen = await open()
      await press(screen, 'Enter code to complete')
      await type(screen, "Customer's delivery code", '482913')
      api.post.mockResolvedValue({ data: { delivery: delivery({ status: 'DELIVERED', address: null, items: [], amountToCollect: 0, cashCollected: true }) } })

      await press(screen, 'Complete delivery')

      expect(api.post).toHaveBeenCalledWith('/rider/deliveries/d1/complete', { code: '482913' })
      const text = screenText(screen)
      expect(text).toMatch(/Delivered\. Thank you/)
      expect(text).toMatch(/closed, so the customer details are no longer shown/)
      expect(text).toMatch(/Cash collected/)
      expect(text).not.toMatch(/Sana Iqbal/)
      expect(has(screen, 'Enter code to complete')).toBe(false)
      expect(has(screen, 'Could not deliver')).toBe(false)
    })

    it('says how many tries are left after a wrong code, and keeps the field open', async () => {
      const screen = await open()
      await press(screen, 'Enter code to complete')
      await type(screen, "Customer's delivery code", '000000')
      api.post.mockRejectedValue(httpError(422, { code: 'INVALID_CODE', message: 'That code is not correct.', attemptsRemaining: 3 }))

      await press(screen, 'Complete delivery')

      expect(screenText(screen)).toMatch(/That code is not correct\. 3 tries left\./)
      expect(has(screen, 'Complete delivery')).toBe(true)
    })

    it('tells the rider to ask the brand when the code is locked', async () => {
      const screen = await open()
      await press(screen, 'Enter code to complete')
      await type(screen, "Customer's delivery code", '000000')
      api.post.mockRejectedValue(httpError(429, { code: 'CODE_LOCKED', message: 'Too many wrong codes.' }))
      await press(screen, 'Complete delivery')
      expect(screenText(screen)).toMatch(/Ask the brand to complete this delivery/)
    })

    it('can be cancelled without sending anything', async () => {
      const screen = await open()
      await press(screen, 'Enter code to complete')
      await type(screen, "Customer's delivery code", '123456')
      await press(screen, 'Cancel')
      expect(has(screen, 'Enter code to complete')).toBe(true)
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  describe('when it cannot be delivered', () => {
    it('needs a reason, then records the failed attempt', async () => {
      const screen = await open()
      await press(screen, 'Could not deliver')
      expect(isDisabled(screen, 'Mark as not delivered')).toBe(true)
      await type(screen, 'Why could it not be delivered?', '  Customer not reachable ')
      api.patch.mockResolvedValue({ data: { delivery: delivery({ status: 'FAILED', failureReason: 'Customer not reachable' }) } })

      await press(screen, 'Mark as not delivered')

      expect(api.patch).toHaveBeenCalledWith('/rider/deliveries/d1/status', { status: 'FAILED', failureReason: 'Customer not reachable' })
      const text = screenText(screen)
      expect(text).toMatch(/Marked as not delivered/)
      expect(text).toMatch(/Last attempt failed: Customer not reachable/)
      expect(has(screen, 'Try again')).toBe(true) // a failed delivery can be re-attempted
    })
  })

  it('a prepaid order says to collect nothing', async () => {
    const screen = await open(delivery({ paymentMethod: 'CARD', amountToCollect: 0 }))
    expect(screenText(screen)).toMatch(/Already paid online\. Collect nothing\./)
    expect(screenText(screen)).not.toMatch(/Collect in cash/)
  })

  it("someone else's (or a missing) delivery is just 'not found'", async () => {
    mockParams = { id: 'zzz' }
    api.get.mockRejectedValue(httpError(404, { message: 'Delivery not found.' }))
    const screen = await show(<DeliveryScreen />)
    expect(screenText(screen)).toMatch(/Delivery not found/)
    expect(screenText(screen)).toMatch(/given to someone else/)
  })

  it('offers a retry when the delivery could not be loaded', async () => {
    mockParams = { id: 'd1' }
    api.get.mockRejectedValueOnce(httpError(500, { message: 'Server error' }))
    const screen = await show(<DeliveryScreen />)
    expect(screenText(screen)).toMatch(/Couldn't load this delivery/)
    api.get.mockResolvedValue({ data: { delivery: delivery() } })
    await press(screen, 'Try again')
    expect(screenText(screen)).toMatch(/Sana Iqbal/)
  })
})

describe('cash', () => {
  it('shows how much the rider is holding', async () => {
    api.get.mockResolvedValue({ data: { cash: { count: 3, total: 7350 } } })
    const screen = await show(<Cash />)
    expect(api.get).toHaveBeenCalledWith('/rider/deliveries/cash')
    expect(screenText(screen)).toMatch(/Rs 7,350/)
    expect(screenText(screen)).toMatch(/From 3 deliveries/)
  })

  it('says when there is nothing to hand over, and offers a retry on errors', async () => {
    api.get.mockResolvedValue({ data: { cash: { count: 0, total: 0 } } })
    expect(screenText(await show(<Cash />))).toMatch(/No cash to hand over/)

    api.get.mockRejectedValueOnce(httpError(500, { message: 'Server error' }))
    const screen = await show(<Cash />)
    expect(screenText(screen)).toMatch(/Couldn't load your cash/)
  })
})

describe('alerts', () => {
  const note = (over = {}) => ({ _id: 'n1', type: 'DELIVERY_ASSIGNED', title: 'New delivery', message: 'You have been assigned the delivery for order CC-2026-000042.', isRead: false, createdAt: NOW, data: { deliveryId: 'd1' }, ...over })

  it('lists them, marks one read when opened, and goes to that delivery', async () => {
    api.get.mockResolvedValue({ data: { notifications: [note()], pagination: { page: 1, pages: 1, total: 1 }, unreadCount: 1 } })
    api.patch.mockResolvedValue({ data: { notification: note({ isRead: true }) } })
    const screen = await show(<Alerts />)
    expect(screenText(screen)).toMatch(/New delivery/)

    await pressByLabel(screen, 'New delivery')

    expect(api.patch).toHaveBeenCalledWith('/notifications/n1/read')
    expect(mockRouter.push).toHaveBeenCalledWith('/delivery/d1')
  })

  it('has an empty state', async () => {
    api.get.mockResolvedValue({ data: { notifications: [], pagination: { page: 1, pages: 1, total: 0 }, unreadCount: 0 } })
    expect(screenText(await show(<Alerts />))).toMatch(/No alerts/)
  })
})

describe('account', () => {
  it('shows who is signed in and signs out', async () => {
    const auth = signedIn(RIDER)
    const screen = await show(<Account />, { auth })
    expect(screenText(screen)).toMatch(/Bilal Ahmed/)
    expect(screenText(screen)).toMatch(/Delivery rider/)
    await press(screen, 'Sign out')
    expect(auth.logout).toHaveBeenCalled()
    await tick()
  })
})
