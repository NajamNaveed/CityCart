import { useCallback, useEffect, useState } from 'react'
import { fetchNotifications } from '../services/notifications'

// How many notifications the rider has not read, for the tab badge. The inbox
// answer already carries the count, so one request feeds it. It checks again
// every minute (and `refresh()` checks now), which is how a new assignment shows up.
const EVERY_MS = 60 * 1000

const loadCount = () => fetchNotifications(1).then(({ meta }) => meta.unreadCount)

export function useUnreadCount(enabled = true) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(() => {
    loadCount()
      .then(setCount)
      .catch(() => {
        /* the badge just stays as it was */
      })
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    const check = () =>
      loadCount()
        .then((n) => active && setCount(n))
        .catch(() => {
          /* the badge just stays as it was */
        })
    check()
    const timer = setInterval(check, EVERY_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [enabled])

  return { count, refresh }
}
