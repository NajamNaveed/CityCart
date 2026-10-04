import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '../services/api'

// The server's health check lives next to the API, not under /api/v1.
function healthUrl() {
  try {
    return `${new URL(api.defaults.baseURL).origin}/health`
  } catch {
    return `${window.location.origin}/health`
  }
}

const MESSAGES = {
  down: (
    <>
      Cannot reach the CityCart server. Start it with <code>npm run dev</code> in the <code>server</code> folder, and check
      that <code>VITE_API_URL</code> in <code>client/.env</code> points to it.
    </>
  ),
  database: (
    <>
      The server is running but cannot reach its database. Check <code>MONGODB_URI</code> in <code>server/.env</code> and your
      MongoDB Atlas network access, then restart the server.
    </>
  ),
  busy: 'Too many requests were sent from this device. Wait a few minutes, then try again.',
}

/**
 * Shows nothing while everything works. When the server is unreachable, the database is down,
 * or the server is rate limiting this device, it says so, instead of pages silently staying empty.
 */
export default function ServerBanner() {
  const [problem, setProblem] = useState(null) // null | 'down' | 'database' | 'busy'

  useEffect(() => {
    let active = true
    let timer
    let busyTimer

    async function check() {
      try {
        const res = await axios.get(healthUrl(), { timeout: 6000 })
        if (active) setProblem((current) => (res.data.database === 'disconnected' ? 'database' : current === 'busy' ? 'busy' : null))
      } catch {
        if (active) setProblem('down')
      }
      if (active) timer = setTimeout(check, 15000) // keeps watching: the banner goes away once fixed
    }

    function onRateLimited() {
      setProblem('busy')
      clearTimeout(busyTimer)
      busyTimer = setTimeout(() => active && setProblem(null), 60000)
    }

    check()
    window.addEventListener('citycart:rate-limited', onRateLimited)
    return () => {
      active = false
      clearTimeout(timer)
      clearTimeout(busyTimer)
      window.removeEventListener('citycart:rate-limited', onRateLimited)
    }
  }, [])

  if (!problem) return null
  return (
    <div role="alert" className="bg-clay px-4 py-2.5 text-center text-sm text-cream [&_code]:rounded-sm [&_code]:bg-black/20 [&_code]:px-1.5 [&_code]:py-0.5">
      {MESSAGES[problem]}
    </div>
  )
}