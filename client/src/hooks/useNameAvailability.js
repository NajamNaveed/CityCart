import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Live "is this name free?" check against a public check-name endpoint,
 * debounced so it fires once the visitor pauses typing.
 * Returns 'idle' | 'checking' | 'available' | 'taken'.
 */
export function useNameAvailability(endpoint, name) {
  const trimmed = name.trim()
  const [result, setResult] = useState({ name: '', available: null })

  useEffect(() => {
    if (trimmed.length < 2) return undefined
    let active = true
    const timer = setTimeout(() => {
      api
        .get(endpoint, { params: { name: trimmed } })
        .then((res) => active && setResult({ name: trimmed, available: res.data.available }))
        .catch(() => active && setResult({ name: trimmed, available: null }))
    }, 500)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [endpoint, trimmed])

  if (trimmed.length < 2) return 'idle'
  if (result.name !== trimmed) return 'checking'
  if (result.available === true) return 'available'
  if (result.available === false) return 'taken'
  return 'idle'
}