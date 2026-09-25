import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Phase 0 placeholder page.
 *
 * Confirms the React app renders, Tailwind classes apply, and the frontend
 * can reach the backend's health check over CORS. No business UI belongs
 * here yet — see docs/18-development-roadmap.md for later phases.
 */
function Home() {
  const [status, setStatus] = useState('checking...')

  useEffect(() => {
    const healthUrl = `${new URL(api.defaults.baseURL).origin}/health`

    api
      .get(healthUrl)
      .then((res) => setStatus(res.data.status))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-slate-100">
      <h1 className="text-3xl font-semibold">CityCart</h1>
      <p className="text-slate-400">Repository foundation — Phase 0</p>
      <p className="text-sm">
        Backend status:{' '}
        <span
          className={
            status === 'ok' ? 'text-emerald-400' : 'text-amber-400'
          }
        >
          {status}
        </span>
      </p>
    </main>
  )
}

export default Home
