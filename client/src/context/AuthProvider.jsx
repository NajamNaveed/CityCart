import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { AuthContext } from './contexts'

// Each portal has its own endpoint; the server rejects a role that uses the wrong one.
const LOGIN_PATHS = {
  customer: '/auth/login',
  brand: '/auth/brand/login',
  admin: '/auth/admin/login',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session from the HTTP-only cookie on first load.
  useEffect(() => {
    let active = true
    api
      .get('/auth/me')
      .then((res) => active && setUser(res.data.user))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password, portal = 'customer') => {
    const res = await api.post(LOGIN_PATHS[portal], { email, password })
    setUser(res.data.user)
    return res.data.user
  }, [])

  const register = useCallback(async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password })
    setUser(res.data.user)
    return res.data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}