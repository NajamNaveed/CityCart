import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { AccessibilityInfo } from 'react-native'
import { useReduceMotion } from '../src/hooks/useReduceMotion'

function Probe({ out }) {
  out.push(useReduceMotion())
  return null
}

async function mount(out) {
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(<Probe out={out} />)
  })
  return renderer
}

afterEach(() => jest.restoreAllMocks())

describe('useReduceMotion', () => {
  it('follows the phone setting while the screen is open', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const remove = jest.fn()
    let listener = null
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, callback) => {
      listener = callback
      return { remove }
    })

    const out = []
    let renderer
    await act(async () => {
      renderer = TestRenderer.create(<Probe out={out} />)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(out.at(-1)).toBe(true)

    act(() => listener(false))
    expect(out.at(-1)).toBe(false)

    await act(async () => renderer.unmount())
    expect(remove).toHaveBeenCalled()
  })

  it('stays calm when the platform cannot answer', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(undefined)
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(undefined)

    const out = []
    const renderer = await mount(out)
    expect(out).toEqual([false])
    await act(async () => renderer.unmount())
  })
})
