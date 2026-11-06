import api from './api'
import { tokenStore } from './storage'

/**
 * Sign-in rules, kept free of React so they can be tested on their own.
 * AuthProvider just holds the result in state.
 */

// Who this app is for. The server enforces the same list (STAFF_APP_ROLES).
export const STAFF_ROLES = ['BRAND_EMPLOYEE', 'PICKER']
export const isStaffRole = (role) => STAFF_ROLES.includes(role)

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
    if (!isStaffRole(user?.role)) {
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
  let res
  try {
    res = await api.post('/auth/staff/login', { email, password })
  } catch (err) {
    // A team member of several brands proves the password first, then picks
    // the brand to work in (docs/06 §9). No session exists yet.
    const data = err.response?.data
    if (data?.code === 'WORKSPACE_REQUIRED') {
      throw Object.assign(new Error(data.message || 'Choose a workspace.'), {
        workspace: { workspaceToken: data.workspaceToken, memberships: data.memberships || [] },
      })
    }
    throw err
  }
  return acceptSession(res.data)
}

// Exchanges the workspace token and the chosen brand for a staff session,
// keeping the same `client: staff` mark the server put on the token.
export async function chooseWorkspace({ workspaceToken, brandId }) {
  const res = await api.post('/auth/workspace', { workspaceToken, brandId })
  return acceptSession(res.data)
}

async function acceptSession({ user, token }) {
  if (!token || !isStaffRole(user?.role)) throw new Error('The server did not return a session. Please try again.')
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
