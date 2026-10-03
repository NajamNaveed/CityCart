// "Where was the visitor before we asked them to sign in?"
// Only same-site paths are accepted so ?next= can never be used as an open redirect.
export function safeNext(raw, fallback = '/') {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (raw.startsWith('/login') || raw.startsWith('/register')) return fallback
  return raw
}

export const loginUrl = (next) => `/login?next=${encodeURIComponent(next)}`
export const registerUrl = (next) => `/register?next=${encodeURIComponent(next)}`