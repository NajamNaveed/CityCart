// "Where was the shopper before we asked them to sign in?"
// Only paths inside the app are accepted, so a crafted link can never send
// someone to another site or another app after they sign in.
const AUTH_PATHS = ['/login', '/register']

export function safeNext(raw, fallback = '/') {
  if (typeof raw !== 'string' || raw.length > 300) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) return fallback
  if (AUTH_PATHS.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) return fallback
  return raw
}

// Opens Nearby with a search and/or a view already applied. The timestamp `t`
// makes every call a NEW request: Nearby stays mounted, so without it asking
// for the same thing twice (after clearing the search by hand) would be ignored.
export function nearbyHref({ q = '', view } = {}) {
  return { pathname: '/nearby', params: { ...(q && { q }), ...(view && { view }), t: String(Date.now()) } }
}

export const loginHref = (next) => (next ? { pathname: '/login', params: { next } } : '/login')
export const registerHref = (next) => (next ? { pathname: '/register', params: { next } } : '/register')
