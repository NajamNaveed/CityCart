// EXPO_PUBLIC_API_URL is documented in .env.example. "/api/v1" is added when
// missing, so the bare server address works too. Left empty, API calls fail
// with a clear message instead of quietly going to the wrong place.
export function resolveBaseURL(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

export const API_URL = resolveBaseURL(process.env.EXPO_PUBLIC_API_URL)

// Release builds of Android refuse plain http, so a local address only works while developing.
export const apiIsInsecure = Boolean(API_URL && API_URL.startsWith('http://'))
