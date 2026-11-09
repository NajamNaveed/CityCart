import api from './api'

export const DEFAULT_SETTINGS = { platformName: 'CityCart', supportEmail: '', supportPhone: '' }

// The support details change rarely, so they are fetched once and shared.
let cached = null
let pending = null

export function fetchPublicSettings() {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = api
      .get('/settings/public')
      .then((res) => {
        cached = { ...DEFAULT_SETTINGS, ...(res.data?.settings || {}) }
        return cached
      })
      .catch(() => DEFAULT_SETTINGS)
      .finally(() => {
        pending = null
      })
  }
  return pending
}

// Tests start each case with a clean cache.
export function resetPublicSettings() {
  cached = null
  pending = null
}
