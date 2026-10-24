import { formatPrice, humanize, timeAgo } from '../src/utils/format'

describe('formatting', () => {
  it('prices look like the web app', () => {
    expect(formatPrice(2450)).toBe('Rs 2,450')
    expect(formatPrice(1250.5)).toBe('Rs 1,250.50')
    expect(formatPrice(0)).toBe('Rs 0')
  })

  it('statuses read as words', () => {
    expect(humanize('OUT_FOR_DELIVERY')).toBe('Out for delivery')
  })

  it('timeAgo gives short stamps', () => {
    expect(timeAgo(new Date())).toBe('just now')
    expect(timeAgo(new Date(Date.now() - 5 * 60 * 1000))).toBe('5m')
    expect(timeAgo(new Date(Date.now() - 3 * 3600 * 1000))).toBe('3h')
    expect(timeAgo('nonsense')).toBe('')
  })
})
