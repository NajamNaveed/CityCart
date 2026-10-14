import { useEffect } from 'react'

// Runs `autoDetect` once shortly after mount, when `enabled`. The page paints
// first so the browser's permission prompt doesn't cover an empty screen.
export function useFirstVisitDetect(autoDetect, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setTimeout(autoDetect, 1200)
    return () => clearTimeout(timer)
    // Once per mount: autoDetect changes identity as the shopper's area changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
