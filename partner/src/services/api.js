import axios from 'axios'
import { API_URL } from './config'
import { tokenStore } from './storage'

/**
 * The API client. Every request says it comes from the partner app
 * (`X-Client: partner`, which the server requires for partner sign-in) and
 * carries the stored token as `Authorization: Bearer`.
 */
// eslint-disable-next-line import/no-named-as-default-member -- axios documents `axios.create` as the way to make a client
const api = axios.create({
  baseURL: API_URL || undefined,
  timeout: 15000,
  headers: { 'X-Client': 'partner' },
})

api.interceptors.request.use((config) => {
  if (!API_URL) {
    return Promise.reject(Object.assign(new Error('NOT_CONFIGURED'), { notConfigured: true }))
  }
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// The session ended on the server (expired, account deactivated, password
// changed). The app registers a handler that signs the user out locally.
let onUnauthorized = null
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

// A wrong password at sign-in is also a 401: that is not a lost session.
const AUTH_ENDPOINTS = /\/auth\/partner\/login$/

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const sentToken = Boolean(error.config?.headers?.Authorization)
    const url = String(error.config?.url || '')
    if (error.response?.status === 401 && sentToken && !AUTH_ENDPOINTS.test(url) && onUnauthorized) {
      onUnauthorized()
    }
    return Promise.reject(error)
  },
)

// The server's 403 message is deliberately generic; its `code` says why.
const FORBIDDEN_MESSAGES = {
  WEB_ONLY: 'Brand owners and admins sign in on the CityCart website.',
  PARTNER_APP_ONLY: 'This sign-in is for the CityCart Partner app.',
}

// Backend errors are always { success: false, message, errors? }.
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.notConfigured) return 'The app is not connected to a server yet. Set EXPO_PUBLIC_API_URL and restart.'
  if (err?.code === 'ECONNABORTED') return 'The server took too long to answer. Please try again.'
  if (!err?.response) return 'Cannot reach the server. Check your connection.'
  const { status, data } = err.response
  if (status === 429) return data?.message || 'Too many attempts. Please wait a few minutes and try again.'
  return FORBIDDEN_MESSAGES[data?.code] || data?.message || fallback
}

// Turns [{ field, message }] into { field: message } for inline form errors.
export function getFieldErrors(err) {
  const list = err?.response?.data?.errors
  if (!Array.isArray(list)) return {}
  return Object.fromEntries(list.map((e) => [e.field, e.message]))
}

export default api
