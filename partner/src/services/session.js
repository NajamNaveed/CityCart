import api from './api'
import { tokenStore } from './storage'

/**
 * Sign-in rules, kept free of React so they can be tested on their own.
 * AuthProvider just holds the result in state.
 */

// Who this app is for. The server enforces the same list (PARTNER_ROLES).
export const PARTNER_ROLES = ['RIDER', 'BRAND_EMPLOYEE']
export const isPartnerRole = (role) => PARTNER_ROLES.includes(role)

// At app start: is the stored token still good?
//   { status: 'signedOut' }                       no token, or the server says it is no longer valid
//   { status: 'signedIn', user }                  token accepted
//   { status: 'signedOut', offline: true }        the server could not be reached; the token is KEPT,
//                                                 so the next launch with a connection restores it
export async function restoreSession() {
  const token = await tokenStore.load()
  if (!token) return { status: 'signedOut' }
  try {
    const res = await api.get('/auth/me')
    const user = res.data.user
    if (!isPartnerRole(user?.role)) {
      // Not an account this app is for: do not keep its token.
      await tokenStore.clear()
      return { status: 'signedOut' }
    }
    return { status: 'signedIn', user }
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      await tokenStore.clear()
      return { status: 'signedOut' }
    }
    return { status: 'signedOut', offline: true }
  }
}

export async function signIn({ email, password }) {
  const res = await api.post('/auth/partner/login', { email, password })
  const { user, token } = res.data
  if (!token || !isPartnerRole(user?.role)) throw new Error('The server did not return a session. Please try again.')
  await tokenStore.set(token)
  // The sign-in answer does not list a team member's permissions; `/auth/me` does.
  // Without them the app would not know which screens to offer.
  if (user.role === 'BRAND_EMPLOYEE') {
    try {
      const me = await api.get('/auth/me')
      return me.data.user
    } catch (err) {
      await tokenStore.clear()
      throw err
    }
  }
  return user
}

// There is nothing to tell the server: the token simply stops being used.
export const signOut = () => tokenStore.clear()
