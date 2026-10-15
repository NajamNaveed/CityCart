import { formatPrice, humanize } from '../src/utils/format'

describe('formatPrice (same look as the web app)', () => {
  it('groups thousands and drops empty decimals', () => {
    expect(formatPrice(4500)).toBe('Rs 4,500')
    expect(formatPrice(1234567)).toBe('Rs 1,234,567')
    expect(formatPrice(0)).toBe('Rs 0')
    expect(formatPrice(999)).toBe('Rs 999')
  })

  it('keeps real decimals and rounds to two places', () => {
    expect(formatPrice(1250.5)).toBe('Rs 1,250.50')
    expect(formatPrice(10.999)).toBe('Rs 11')
  })

  it('never shows NaN or undefined', () => {
    expect(formatPrice(undefined)).toBe('Rs 0')
    expect(formatPrice(null)).toBe('Rs 0')
    expect(formatPrice('abc')).toBe('Rs 0')
  })
})

describe('humanize', () => {
  it('turns status codes into words', () => {
    expect(humanize('READY_FOR_SHIPMENT')).toBe('Ready for shipment')
    expect(humanize('')).toBe('')
  })
})
