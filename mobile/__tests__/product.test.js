jest.mock('../src/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }))

import { availabilityInfo, discountPercent, formatDate, initial, monogram } from '../src/utils/product'
import { resolveCityId } from '../src/services/cities'

describe('discountPercent', () => {
  it('works out the percentage off', () => {
    expect(discountPercent({ price: 800, compareAtPrice: 1000 })).toBe(20)
    expect(discountPercent({ price: 3600, compareAtPrice: 4400 })).toBe(18)
  })
  it('is zero without a real discount', () => {
    expect(discountPercent({ price: 1000 })).toBe(0)
    expect(discountPercent({ price: 1000, compareAtPrice: 1000 })).toBe(0)
    expect(discountPercent({ price: 1200, compareAtPrice: 1000 })).toBe(0)
    expect(discountPercent(undefined)).toBe(0)
  })
})

describe('availabilityInfo', () => {
  it('says sold out, low stock or in stock', () => {
    expect(availabilityInfo({ availability: 'OUT_OF_STOCK' })).toMatchObject({ label: 'Sold out', soldOut: true, tone: 'bad' })
    expect(availabilityInfo({ availability: 'LOW_STOCK' })).toMatchObject({ label: 'Only a few left', soldOut: false, tone: 'warn' })
    expect(availabilityInfo({ availability: 'IN_STOCK' })).toMatchObject({ label: 'In stock', tone: 'good' })
    expect(availabilityInfo({})).toMatchObject({ label: 'In stock' })
  })
})

describe('names and dates', () => {
  it('builds initials and brand monograms', () => {
    expect(initial('sana iqbal')).toBe('S')
    expect(initial('')).toBe('?')
    expect(monogram('Loom & Co.')).toBe('LC')
    expect(monogram('Zaitoon Footwear')).toBe('ZF')
    expect(monogram('Naqsh')).toBe('N')
    expect(monogram('')).toBe('?')
  })
  it('formats a date and survives a bad one', () => {
    expect(formatDate('2026-10-04T10:00:00Z')).toMatch(/2026/)
    expect(formatDate('not a date')).toBe('')
  })
})

describe('resolveCityId', () => {
  const cities = [{ _id: 'c1' }, { _id: 'c2' }]
  it('keeps a remembered city that still exists', () => {
    expect(resolveCityId(cities, 'c2')).toBe('c2')
  })
  it('falls back to all cities when it is gone or never chosen', () => {
    expect(resolveCityId(cities, 'deleted')).toBe('')
    expect(resolveCityId(cities, '')).toBe('')
    expect(resolveCityId([], 'c1')).toBe('')
  })
})
