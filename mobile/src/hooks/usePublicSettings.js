import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, fetchPublicSettings } from '../services/settings'

export function usePublicSettings() {
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    let active = true
    fetchPublicSettings().then((value) => {
      if (active) setSettings(value)
    })
    return () => {
      active = false
    }
  }, [])

  return { settings: settings || DEFAULT_SETTINGS, loading: !settings }
}
