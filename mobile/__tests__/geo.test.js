import { boundsOfBlocks, formatDistance, isValidLatLng, latLngOfGeoPoint, mapsUrl, roundCoord } from '../src/utils/geo'

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

describe('latLngOfGeoPoint', () => {
  it('turns an order pin from [longitude, latitude] into the map’s { lat, lng }', () => {
    expect(latLngOfGeoPoint({ type: 'Point', coordinates: [73.06, 31.42] })).toEqual({ lat: 31.42, lng: 73.06 })
  })

  it('gives nothing for a missing or malformed pin', () => {
    expect(latLngOfGeoPoint(null)).toBeNull()
    expect(latLngOfGeoPoint({})).toBeNull()
    expect(latLngOfGeoPoint({ coordinates: [73.06] })).toBeNull()
    expect(latLngOfGeoPoint({ coordinates: [200, 31.42] })).toBeNull()
  })
})

describe('boundsOfBlocks', () => {
  it('wraps every outline of the city in one rectangle', () => {
    const bounds = boundsOfBlocks([
      { _id: 'a', polygon: [[31.39, 73.09], [31.41, 73.09], [31.41, 73.11], [31.39, 73.11]] },
      { _id: 'b', polygon: [[31.42, 73.07], [31.44, 73.07], [31.44, 73.09]] },
    ])
    expect(bounds).toEqual({ south: 31.39, north: 31.44, west: 73.07, east: 73.11 })
  })

  it('falls back to the centre of a block that has no outline', () => {
    expect(boundsOfBlocks([{ _id: 'c', latitude: 31.4, longitude: 73.1 }])).toEqual({ south: 31.4, north: 31.4, west: 73.1, east: 73.1 })
  })

  it('gives nothing when no block has a usable position', () => {
    expect(boundsOfBlocks([])).toBeNull()
    expect(boundsOfBlocks([{ _id: 'x', polygon: [['bad', 'ring']] }])).toBeNull()
  })
})
