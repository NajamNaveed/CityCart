import axios from 'axios'
import { toast } from '../components/ui/toast'

// VITE_API_URL is documented in .env.example, e.g. http://localhost:5000/api/v1.
// A missing "/api/v1" on the end is added, so "http://localhost:5000" works too.
// Left EMPTY, the API is assumed same-origin — requests go to /api/v1 on the
// site serving this app (the Vercel deployment proxies them to Render). This
// keeps the auth cookie first-party, which is what makes cross-domain
// deployments survive browser third-party-cookie blocking (docs/17 §15).
function resolveBaseURL(raw) {
  const trimmed = (raw || '').trim().replace(/\/+$/, '')
  if (!trimmed) return '/api/v1'
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

const api = axios.create({
  baseURL: resolveBaseURL(import.meta.env.VITE_API_URL),
  withCredentials: true, // required for the HTTP-only auth cookie
})

// Rate limiting surfaces as a toast instead of a page banner.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      toast('Too many requests were sent from this device. Wait a few minutes, then try again.', {
        type: 'error',
        duration: 6000,
      })
    }
    return Promise.reject(error)
  },
)

// The server's 403 message is deliberately generic; its `code` says why.
const FORBIDDEN_MESSAGES = {
  PERMISSION_DENIED: 'Your account does not have permission to do this. Ask the brand owner to update your access.',
  EMPLOYEE_INACTIVE: 'Your team account has been deactivated. Contact the brand owner.',
  NO_BRAND: 'This account is not linked to a brand.',
}

// Backend errors are always { success: false, message, errors? }.
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err.response) return 'Cannot reach the server. Check your connection.'
  const { code, message } = err.response.data || {}
  return FORBIDDEN_MESSAGES[code] || message || fallback
}

// Turns [{ field, message }] into { field: message } for inline form errors.
export function getFieldErrors(err) {
  const list = err.response?.data?.errors
  if (!Array.isArray(list)) return {}
  return Object.fromEntries(list.map((e) => [e.field, e.message]))
}

export default api