import React from 'react'
import { View } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('@expo/vector-icons/Feather', () => () => null)

let networkListener
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (listener) => ((networkListener = listener), () => {}) },
}))

import OfflineBanner from '../src/components/OfflineBanner'

const flatStyle = (style) => [].concat(style).flat().reduce((all, s) => ({ ...all, ...(s || {}) }), {})

async function mount() {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(<OfflineBanner />)
  })
  return renderer
}

describe('the offline banner', () => {
  it('appears only when the phone says it is disconnected', async () => {
    const renderer = await mount()
    expect(renderer.toJSON()).toBeNull()

    await act(async () => networkListener({ isConnected: false }))
    const alert = renderer.root.find((n) => n.props.accessibilityRole === 'alert')
    expect(alert).toBeTruthy()

    await act(async () => networkListener({ isConnected: true }))
    expect(renderer.toJSON()).toBeNull()
  })

  it('takes its own space below the status bar instead of covering the top of the screen', async () => {
    const renderer = await mount()
    await act(async () => networkListener({ isConnected: false }))

    const absolute = renderer.root.findAllByType(View).map((v) => flatStyle(v.props.style)).filter((style) => style.position === 'absolute')
    expect(absolute).toHaveLength(0)
  })
})
