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

// Opens the Shop with a search and/or a brand already applied. The timestamp `t`
// makes every call a NEW request: the Shop stays alive in the tab bar, so without it
// asking for the same brand twice (after clearing the filter by hand) would look
// like "nothing changed" and be ignored.
export function shopHref({ q = '', brandId = '' } = {}) {
  return { pathname: '/shop', params: { ...(q && { q }), ...(brandId && { brandId }), t: String(Date.now()) } }
}

export const loginHref = (next) => (next ? { pathname: '/login', params: { next } } : '/login')
export const registerHref = (next) => (next ? { pathname: '/register', params: { next } } : '/register')
