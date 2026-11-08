import { useEffect, useState } from 'react'
import api from '../services/api'

const DEFAULTS = { platformName: 'CityCart', supportEmail: '', supportPhone: '' }

// Help, Contact and the policy pages all need the same support address, so the
// request is shared instead of repeated per page.
let cached = null
let pending = null

function load() {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = api
      .get('/settings/public')
      .then((res) => {
        cached = { ...DEFAULTS, ...(res.data?.settings || {}) }
        return cached
      })
      .catch(() => DEFAULTS)
      .finally(() => {
        pending = null
      })
  }
  return pending
}

export function usePublicSettings() {
  const [settings, setSettings] = useState(cached)

  useEffect(() => {
    if (cached) return undefined
    let active = true
    load().then((value) => {
      if (active) setSettings(value)
    })
    return () => {
      active = false
    }
  }, [])

  return { settings: settings || DEFAULTS, loading: !settings }
}
