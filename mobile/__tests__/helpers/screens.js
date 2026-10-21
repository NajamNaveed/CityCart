// Small helpers shared by the screen tests (no mocks in here: those live in each test file).
import React from 'react'
import { Text } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import { AuthContext, CartContext, ChatContext, CityContext, NotificationContext } from '../../src/context/contexts'

export const textOf = (node) => [].concat(node.props.children).flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
export const screenText = (renderer) => renderer.root.findAllByType(Text).map(textOf).join(' | ')

// Let every pending promise settle (screens load their data when they open).
export const tick = async (times = 6) => {
  for (let i = 0; i < times; i += 1) await act(async () => { await Promise.resolve() })
}

export const CUSTOMER = { id: 'u1', name: 'Sana Iqbal', email: 'sana@example.com', role: 'CUSTOMER' }

export const signedIn = (user = CUSTOMER) => ({ status: 'signedIn', user, isReady: true, offline: false, login: jest.fn(), register: jest.fn(), logout: jest.fn(), retry: jest.fn() })
export const signedOut = () => ({ status: 'signedOut', user: null, isReady: true, offline: false, login: jest.fn(), register: jest.fn(), logout: jest.fn(), retry: jest.fn() })

// Renders an element with a chosen sign-in state and fake cart/city/chat values.
export const notificationsValue = (over = {}) => ({ unreadCount: 0, refresh: jest.fn(), markRead: jest.fn().mockResolvedValue({}), markAllRead: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined), subscribeChat: jest.fn(() => jest.fn()), ...over })
export const chatValue = (over = {}) => ({ unread: 0, refreshUnread: jest.fn().mockResolvedValue(undefined), subscribe: jest.fn(() => jest.fn()), ...over })

export function tree(element, { auth = signedOut(), cart, city, notifications, chat } = {}) {
  const cartValue = cart || { itemCount: 0, addItem: jest.fn().mockResolvedValue({ itemCount: 1 }), setCount: jest.fn() }
  const cityValue = city || { cities: [], city: { _id: 'c1', name: 'Faisalabad' }, cityId: 'c1', setCityId: jest.fn(), ready: true }
  return (
    <AuthContext.Provider value={auth}>
      <CityContext.Provider value={cityValue}>
        <CartContext.Provider value={cartValue}>
          <NotificationContext.Provider value={notifications || notificationsValue()}>
            <ChatContext.Provider value={chat || chatValue()}>{element}</ChatContext.Provider>
          </NotificationContext.Provider>
        </CartContext.Provider>
      </CityContext.Provider>
    </AuthContext.Provider>
  )
}

// Every screen a test opens is closed again afterwards, so nothing keeps running (list timers) after the test ends.
const opened = []
export async function cleanup() {
  while (opened.length) {
    const renderer = opened.pop()
    await act(async () => renderer.unmount())
  }
}

export async function show(element, options) {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(tree(element, options))
  })
  opened.push(renderer)
  await tick()
  return renderer
}

// Press the control whose label is `label` (buttons and rows are Pressables around a Text).
export async function press(renderer, label) {
  const target = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t) === label))[0]
  if (!target) throw new Error(`nothing to press labelled "${label}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

// Press a control found by its accessibility label (icon-only buttons).
export async function pressByLabel(renderer, label) {
  const target = renderer.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]
  if (!target) throw new Error(`no control with accessibility label "${label}"`)
  await act(async () => target.props.onPress())
  await tick()
}

export async function type(renderer, label, value) {
  const input = renderer.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0]
  if (!input) throw new Error(`no input labelled "${label}"`)
  await act(async () => input.props.onChangeText(value))
}
