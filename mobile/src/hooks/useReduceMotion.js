import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

// The phone's "remove animations" setting (iOS Reduce Motion, Android Remove
// animations). Sheets still open; they just arrive without the slide or fade.
export function useReduceMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let active = true
    const apply = (value) => {
      if (active) setReduced(Boolean(value))
    }
    // Native answers arrive asynchronously; mirrors of the platform can return
    // nothing, so the guard keeps the screen working either way.
    const answer = AccessibilityInfo.isReduceMotionEnabled?.()
    if (answer && typeof answer.then === 'function') answer.then(apply).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', apply)
    return () => {
      active = false
      subscription?.remove?.()
    }
  }, [])

  return reduced
}
