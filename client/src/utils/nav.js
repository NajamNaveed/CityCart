// "Where was the visitor before we asked them to sign in?"
// Only same-site paths are accepted so ?next= can never be used as an open redirect.
const AUTH_PATHS = ['/login', '/register', '/sell/login', '/sell/apply', '/admin/login']

export function safeNext(raw, fallback = '/') {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (AUTH_PATHS.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) return fallback
  return raw
}

// Where each kind of account lands after signing in.
export function homeFor(role) {
  if (role === 'SUPER_ADMIN') return '/admin'
  if (role === 'BRAND_ADMIN' || role === 'BRAND_EMPLOYEE') return '/brand'
  return '/'
}

export const loginUrl = (next, base = '/login') => `${base}?next=${encodeURIComponent(next)}`
export const registerUrl = (next) => `/register?next=${encodeURIComponent(next)}`