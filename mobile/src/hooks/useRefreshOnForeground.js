import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

// Runs `callback` every time the app comes back to the foreground (for example after paying in the
// browser). The latest callback is always the one called, without re-subscribing on every render.
export function useRefreshOnForeground(callback) {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') latest.current()
    })
    return () => subscription.remove()
  }, [])
}
