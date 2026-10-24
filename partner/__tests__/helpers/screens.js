// Small helpers shared by the screen tests (no mocks in here: those live in each test file).
import React from 'react'
import { Text } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import { AuthContext } from '../../src/context/contexts'

export const textOf = (node) => [].concat(node.props.children).flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')
export const screenText = (renderer) => renderer.root.findAllByType(Text).map(textOf).join(' | ')

// Let every pending promise settle (screens load their data when they open).
export const tick = async (times = 6) => {
  for (let i = 0; i < times; i += 1) await act(async () => { await Promise.resolve() })
}

export const RIDER = { id: 'u1', name: 'Bilal Ahmed', email: 'bilal@example.com', phone: '+92 322 7741095', role: 'RIDER' }
export const EMPLOYEE = { id: 'u2', name: 'Maryam Javed', email: 'maryam@example.com', role: 'BRAND_EMPLOYEE', permissions: ['orders.view'] }

const authValue = (status, user, offline = false) => ({ status, user, isReady: status !== 'loading', offline, login: jest.fn(), logout: jest.fn(), retry: jest.fn() })
export const signedIn = (user = RIDER) => authValue('signedIn', user)
export const signedOut = (offline = false) => authValue('signedOut', null, offline)

export const tree = (element, { auth = signedIn() } = {}) => <AuthContext.Provider value={auth}>{element}</AuthContext.Provider>

// Every screen a test opens is closed again afterwards, so nothing keeps running (timers) after the test ends.
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

const pressable = (renderer, label) =>
  renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => textOf(t) === label))[0]

export const has = (renderer, label) => Boolean(pressable(renderer, label))
export const isDisabled = (renderer, label) => {
  const target = pressable(renderer, label)
  if (!target) throw new Error(`nothing labelled "${label}" in: ${screenText(renderer)}`)
  return target.props.disabled === true
}

// Press the control whose label is `label` (buttons and rows are Pressables around a Text).
export async function press(renderer, label) {
  const target = pressable(renderer, label)
  if (!target) throw new Error(`nothing to press labelled "${label}" in: ${screenText(renderer)}`)
  await act(async () => target.props.onPress())
  await tick()
}

// Press a control found by its accessibility label (icon-only buttons, list rows).
export async function pressByLabel(renderer, label) {
  const target = renderer.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === 'function')[0]
  if (!target) throw new Error(`no control with accessibility label "${label}"`)
  await act(async () => target.props.onPress())
  await tick()
}

export async function type(renderer, label, value) {
  const input = renderer.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0]
  if (!input) throw new Error(`no input labelled "${label}"`)
  await act(async () => input.props.onChangeText(value))
}
