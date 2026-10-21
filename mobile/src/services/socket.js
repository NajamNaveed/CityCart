import { io } from 'socket.io-client'
import { API_URL } from './config'
import { tokenStore } from './storage'

/**
 * The one live connection (docs/12): push-only. The server identifies the
 * shopper by the login token in the handshake's `auth` payload — never in the
 * URL — and only customers are given a token, so this is shopper-only by
 * construction. The server never accepts commands on the socket; every write
 * goes through REST where permissions are checked.
 */

// The socket talks to the API's origin ("https://…onrender.com"), not to
// /api/v1. Nothing configured means nothing to connect to.
export function serverOrigin() {
  if (!API_URL) return null
  return API_URL.replace(/\/api\/v\d+$/, '') || null
}

export function createLiveConnection(token = tokenStore.get()) {
  const origin = serverOrigin()
  if (!origin || !token) return null
  return io(origin, { auth: { token } })
}

export function closeLiveConnection(socket) {
  socket?.disconnect()
}
