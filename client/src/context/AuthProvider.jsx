import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { AuthContext } from './contexts'

// Each portal has its own endpoint; the server rejects a role that uses the wrong one.
const LOGIN_PATHS = {
  customer: '/auth/login',
  brand: '/auth/brand/login',
  admin: '/auth/admin/login',
}

// Staff dashboards are per-tab sessions (docs/06 §9 — staff session
// security): sessionStorage lives and dies with the tab, so closing it
// drops the marker and the next load requires signing in again. Shoppers
// keep their normal persistent session. The short-lived staff cookie on
// the server is the backstop; this marker is the tab-close detector.
const STAFF_TAB_KEY = 'citycart.staffTab'
const STAFF_ROLES = ['BRAND_ADMIN', 'BRAND_EMPLOYEE', 'SUPER_ADMIN']
const isStaff = (role) => STAFF_ROLES.includes(role)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore the session from the HTTP-only cookie on first load. A staff
  // session restored into a tab that never logged in (new tab, or this tab
  // reopened after close) is signed out server-side immediately.
  useEffect(() => {
    let active = true
    api
      .get('/auth/me')
      .then((res) => {
        if (!active) return
        const restored = res.data.user
        if (isStaff(restored.role) && !sessionStorage.getItem(STAFF_TAB_KEY)) {
          api.post('/auth/logout').catch(() => {})
          setUser(null)
        } else {
          setUser(restored)
        }
      })
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password, portal = 'customer') => {
    await api.post(LOGIN_PATHS[portal], { email, password })
    // /auth/me is the complete picture: a team member's permissions only come with it.
    const me = await api.get('/auth/me')
    if (isStaff(me.data.user.role)) {
      sessionStorage.setItem(STAFF_TAB_KEY, '1')
    } else {
      sessionStorage.removeItem(STAFF_TAB_KEY)
    }
    setUser(me.data.user)
    return me.data.user
  }, [])

  const register = useCallback(async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password })
    sessionStorage.removeItem(STAFF_TAB_KEY)
    setUser(res.data.user)
    return res.data.user
  }, [])

  // Seller sign-up: creates the owner, brand and store in one request and signs the owner in.
  const applyForBrand = useCallback(async (payload) => {
    const res = await api.post('/brands/apply', payload)
    // Brand owners are dashboard staff: their session is per-tab too.
    sessionStorage.setItem(STAFF_TAB_KEY, '1')
    setUser(res.data.user)
    return res.data
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      sessionStorage.removeItem(STAFF_TAB_KEY)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, applyForBrand, logout }),
    [user, loading, login, register, applyForBrand, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
