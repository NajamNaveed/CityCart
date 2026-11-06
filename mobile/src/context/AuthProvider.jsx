import { useCallback, useEffect, useMemo, useState } from 'react'
import { setUnauthorizedHandler } from '../services/api'
import { restoreSession, signIn, signOut, signUp } from '../services/session'
import { AuthContext } from './contexts'

// status: 'loading' (checking the stored token) | 'signedIn' | 'signedOut'
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, offline: false })

  const restore = useCallback(async () => {
    const result = await restoreSession()
    setState({ status: result.status, user: result.user || null, offline: Boolean(result.offline) })
  }, [])

  // Runs once, at app start.
  useEffect(() => {
    let active = true
    restoreSession().then((result) => {
      if (active) setState({ status: result.status, user: result.user || null, offline: Boolean(result.offline) })
    })
    return () => {
      active = false
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut()
    setState({ status: 'signedOut', user: null, offline: false })
  }, [])

  // If the server ever says the session is over, sign out here too.
  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const login = useCallback(async (credentials) => {
    const user = await signIn(credentials)
    setState({ status: 'signedIn', user, offline: false })
    return user
  }, [])

  // Signing up does not sign the shopper in; the customer verifies their
  // email first, so the auth state is left exactly as it was.
  const register = useCallback(async (details) => signUp(details), [])

  const value = useMemo(
    () => ({ ...state, isReady: state.status !== 'loading', login, register, logout, retry: restore }),
    [state, login, register, logout, restore],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
