import { useEffect, useState } from 'react'

// The value, but only after it has stopped changing for `delay` ms (search-as-you-type).
export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
