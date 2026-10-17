import { formatDistance, isValidLatLng, mapsUrl, roundCoord } from '../src/utils/geo'

describe('formatDistance', () => {
  it('reads as metres under a kilometre and kilometres above', () => {
    expect(formatDistance(0.04)).toBe('Under 100 m')
    expect(formatDistance(0.46)).toBe('500 m')
    expect(formatDistance(0.95)).toBe('1000 m')
    expect(formatDistance(1.2)).toBe('1.2 km')
    expect(formatDistance(12)).toBe('12 km')
    expect(formatDistance(null)).toBe('')
    expect(formatDistance(undefined)).toBe('')
  })
})

describe('roundCoord', () => {
  it('keeps four decimals (about 11 metres)', () => {
    expect(roundCoord(31.418654321)).toBe(31.4187)
    expect(roundCoord(73.07904)).toBe(73.079)
    expect(roundCoord(-1.00004)).toBe(-1)
  })
})

describe('mapsUrl', () => {
  it('builds a link that works with no map key', () => {
    expect(mapsUrl({ latitude: 31.4186, longitude: 73.079 })).toBe('https://www.google.com/maps/search/?api=1&query=31.4186%2C73.079')
  })

  it('adds the shop name safely encoded', () => {
    const url = mapsUrl({ latitude: 31.4, longitude: 73.1 }, 'Loom & Co. #1')
    expect(url).toContain('Loom%20%26%20Co.%20%231')
    expect(url).not.toContain('& Co')
  })
})

describe('isValidLatLng', () => {
  it('accepts real positions and rejects the rest', () => {
    expect(isValidLatLng(31.4, 73.1)).toBe(true)
    expect(isValidLatLng(0, 0)).toBe(true)
    expect(isValidLatLng(91, 0)).toBe(false)
    expect(isValidLatLng(0, 181)).toBe(false)
    expect(isValidLatLng(NaN, 1)).toBe(false)
    expect(isValidLatLng('31', '73')).toBe(false)
  })
})
