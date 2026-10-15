import { resolveBaseURL } from '../src/services/config'

describe('resolveBaseURL', () => {
  it('adds /api/v1 when it is missing and tidies slashes', () => {
    expect(resolveBaseURL('https://api.citycart.pk')).toBe('https://api.citycart.pk/api/v1')
    expect(resolveBaseURL('https://api.citycart.pk///')).toBe('https://api.citycart.pk/api/v1')
    expect(resolveBaseURL('  http://192.168.1.20:5000  ')).toBe('http://192.168.1.20:5000/api/v1')
  })

  it('leaves an address that already ends in /api/v1 alone', () => {
    expect(resolveBaseURL('https://api.citycart.pk/api/v1')).toBe('https://api.citycart.pk/api/v1')
    expect(resolveBaseURL('https://api.citycart.pk/api/v1/')).toBe('https://api.citycart.pk/api/v1')
  })

  it('returns null when nothing is configured, so calls fail loudly instead of going nowhere', () => {
    expect(resolveBaseURL('')).toBeNull()
    expect(resolveBaseURL(undefined)).toBeNull()
    expect(resolveBaseURL('   ')).toBeNull()
  })
})
