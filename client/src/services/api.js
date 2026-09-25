import axios from 'axios'

// VITE_API_URL is documented in README.md / .env.example, e.g.
// http://localhost:5000/api/v1
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'

const api = axios.create({
  baseURL,
  withCredentials: true,
})

export default api
