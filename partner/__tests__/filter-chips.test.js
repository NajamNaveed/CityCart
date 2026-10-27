import React from 'react'
import { ScrollView } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import FilterChips from '../src/components/FilterChips'

describe('the filter chips row', () => {
  it('never grows to fill the screen: its height stays the height of the chips', async () => {
    let renderer
    await act(async () => {
      renderer = TestRenderer.create(<FilterChips options={[[undefined, 'All'], ['PAID', 'Paid']]} value={undefined} onChange={() => {}} />)
    })
    const row = renderer.root.findByType(ScrollView)
    const style = [].concat(row.props.style).flat().reduce((all, s) => ({ ...all, ...s }), {})
    // A horizontal ScrollView grows by default and made the chips as tall as the screen.
    expect(style.flexGrow).toBe(0)
    expect(style.flexShrink).toBe(0)
    expect(row.props.horizontal).toBe(true)
  })

  it('selects a chip by tapping it', async () => {
    const onChange = jest.fn()
    let renderer
    await act(async () => {
      renderer = TestRenderer.create(<FilterChips options={[[undefined, 'All'], ['PAID', 'Paid']]} value={undefined} onChange={onChange} />)
    })
    const chip = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button')[1]
    await act(async () => chip.props.onPress())
    expect(onChange).toHaveBeenCalledWith('PAID')
  })
})
