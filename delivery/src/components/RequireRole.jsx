import { Redirect } from 'expo-router'
import { useAuth } from '../hooks/useAuth'

/**
 * Shows its children only to a signed-in account with the given role.
 * Signed out: back to the sign-in. Another role: back to the start screen,
 * which sends each role to its own screens. (The server is the real guard: a
 * rider's token cannot reach anything but the rider's own data.)
 */
export default function RequireRole({ role, children }) {
  const { status, user } = useAuth()
  if (status === 'loading') return null
  if (status !== 'signedIn') return <Redirect href="/login" />
  if (user?.role !== role) return <Redirect href="/" />
  return children
}
