import { isRadius, MAX_RADIUS_KM, MIN_RADIUS_KM, nextRange, normalizeRange, rangeLabel } from '../src/utils/range'

describe('normalizeRange', () => {
  it('keeps valid choices', () => {
    for (const ok of ['block', 'city', '5', '7.5', '0.5', '50']) expect(normalizeRange(ok)).toBe(ok)
    expect(normalizeRange(10)).toBe('10')
  })

  it('falls back to the block for anything else, so a damaged saved value cannot break the search', () => {
    for (const bad of ['', 'abc', '-3', '0.1', '51', '1e3', null, undefined, NaN, {}]) expect(normalizeRange(bad)).toBe('block')
    expect([MIN_RADIUS_KM, MAX_RADIUS_KM]).toEqual([0.5, 50])
  })
})

describe('isRadius', () => {
  it('is true only for a plain number of kilometres', () => {
    expect([isRadius('5'), isRadius('7.5'), isRadius('block'), isRadius('city'), isRadius(''), isRadius('5km')]).toEqual([true, true, false, false, false, false])
  })
})

describe('nextRange (the "try wider" suggestion)', () => {
  it('widens step by step and ends at the whole city', () => {
    expect(nextRange('block')).toBe('5')
    expect(nextRange('2')).toBe('5')
    expect(nextRange('5')).toBe('10')
    expect(nextRange('7.5')).toBe('10')
    expect(nextRange('20')).toBe('50')
    expect(nextRange('50')).toBe('city')
    expect(nextRange('city')).toBeNull()
  })
})

describe('rangeLabel', () => {
  it('reads naturally in a sentence', () => {
    expect(rangeLabel('block')).toBe('this block')
    expect(rangeLabel('city')).toBe('the whole city')
    expect(rangeLabel('10')).toBe('10 km')
  })
})
