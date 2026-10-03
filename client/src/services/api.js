import axios from 'axios'

// VITE_API_URL is documented in .env.example, e.g. http://localhost:5000/api/v1
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'

const api = axios.create({
  baseURL,
  withCredentials: true, // required for the HTTP-only auth cookie
})

// Backend errors are always { success: false, message, errors? }.
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err.response) return 'Cannot reach the server. Check your connection.'
  return err.response.data?.message || fallback
}

// Turns [{ field, message }] into { field: message } for inline form errors.
export function getFieldErrors(err) {
  const list = err.response?.data?.errors
  if (!Array.isArray(list)) return {}
  return Object.fromEntries(list.map((e) => [e.field, e.message]))
}

export default api