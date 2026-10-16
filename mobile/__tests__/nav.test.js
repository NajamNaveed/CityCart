import { loginHref, registerHref, safeNext } from '../src/utils/nav'

describe('safeNext (where to go after signing in)', () => {
  it('accepts paths inside the app', () => {
    expect(safeNext('/cart')).toBe('/cart')
    expect(safeNext('/product/64b7f0c2a1b2c3d4e5f60718')).toBe('/product/64b7f0c2a1b2c3d4e5f60718')
    expect(safeNext('/chat?product=abc')).toBe('/chat?product=abc')
  })

  it('refuses anything that could leave the app or another site', () => {
    for (const bad of ['https://evil.example', 'http://evil.example/x', '//evil.example', '/\\evil', 'citycart://x', 'javascript:alert(1)', '/ok/../x://y', 'cart']) {
      expect(safeNext(bad, '/fallback')).toBe('/fallback')
    }
  })

  it('never bounces back to the sign-in screens', () => {
    for (const path of ['/login', '/login?next=%2Fcart', '/register', '/register/x']) {
      expect(safeNext(path, '')).toBe('')
    }
    expect(safeNext('/loginhelp')).toBe('/loginhelp') // only the exact auth paths are special
  })

  it('handles junk and very long values', () => {
    expect(safeNext(undefined, '/x')).toBe('/x')
    expect(safeNext(['/a'], '/x')).toBe('/x')
    expect(safeNext(`/${'a'.repeat(400)}`, '/x')).toBe('/x')
    expect(safeNext('')).toBe('/')
  })
})

describe('auth links keep the destination', () => {
  it('adds ?next only when there is one', () => {
    expect(loginHref('/cart')).toEqual({ pathname: '/login', params: { next: '/cart' } })
    expect(loginHref('')).toBe('/login')
    expect(registerHref('/cart')).toEqual({ pathname: '/register', params: { next: '/cart' } })
    expect(registerHref()).toBe('/register')
  })
})
