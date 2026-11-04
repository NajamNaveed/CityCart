import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../services/api'

/**
 * Load one thing when the screen opens (and again if `key` changes or reload() is called).
 *
 *   const { status, data, error, reload } = useRemote(id, () => fetchProduct(id))
 *   status: 'loading' | 'ready' | 'error'; `refreshing` is true while reload() fetches again
 * and the previous data stays on screen.
 */
export function useRemote(key, loader) {
  const [reloads, setReloads] = useState(0)
  const [state, setState] = useState({ key: null, token: null, data: null, error: '' })
  const token = `${key}#${reloads}`

  useEffect(() => {
    let active = true
    loader()
      .then((data) => active && setState({ key, token, data, error: '' }))
      .catch((err) => active && setState({ key, token, data: null, error: getErrorMessage(err), status: err.response?.status }))
    return () => {
      active = false
    }
    // `loader` is a new function every render; the token already says when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const ready = state.token === token
  // Same query asked again (reload): keep the old data in view until the new answer lands.
  const keepOld = !ready && state.key === key && state.data !== null
  const status = ready ? (state.error ? 'error' : 'ready') : keepOld ? 'ready' : 'loading'
  return {
    status,
    data: ready || keepOld ? state.data : null,
    error: ready ? state.error : '',
    httpStatus: ready ? state.status : undefined,
    refreshing: keepOld,
    reload: useCallback(() => setReloads((n) => n + 1), []),
  }
}
