import axios from 'axios'

// VITE_API_URL is documented in .env.example, e.g. http://localhost:5000/api/v1
// A missing "/api/v1" on the end is added, so "http://localhost:5000" works too.
function resolveBaseURL(raw) {
  const trimmed = (raw || 'http://localhost:5000/api/v1').trim().replace(/\/+$/, '')
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

const api = axios.create({
  baseURL: resolveBaseURL(import.meta.env.VITE_API_URL),
  withCredentials: true, // required for the HTTP-only auth cookie
})

// Lets the app tell the person when the server is refusing them for sending too much.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) window.dispatchEvent(new Event('citycart:rate-limited'))
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