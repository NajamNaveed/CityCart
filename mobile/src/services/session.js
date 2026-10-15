import api from './api'
import { tokenStore } from './storage'

/**
 * Sign-in rules, kept free of React so they can be tested on their own.
 * AuthProvider just holds the result in state.
 */

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
    return { status: 'signedIn', user: res.data.user }
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      await tokenStore.clear()
      return { status: 'signedOut' }
    }
    return { status: 'signedOut', offline: true }
  }
}

async function startSession(path, body) {
  const res = await api.post(path, body)
  const { user, token } = res.data
  if (!token) throw new Error('The server did not return a session. Please try again.')
  await tokenStore.set(token)
  return user
}

export const signIn = ({ email, password }) => startSession('/auth/login', { email, password })
export const signUp = (details) => startSession('/auth/register', details)

// There is nothing to tell the server: the token simply stops being used.
export const signOut = () => tokenStore.clear()
