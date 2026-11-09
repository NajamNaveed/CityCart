import { nextLayerState } from '../src/utils/layerState'

describe('nextLayerState', () => {
  it('cycles everything -> mine -> hidden -> everything', () => {
    expect(nextLayerState('all')).toBe('mine')
    expect(nextLayerState('mine')).toBe('off')
    expect(nextLayerState('off')).toBe('all')
  })
})
