import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { homeFor, loginUrl, safeNext } from '../utils/nav'

function PageLoader() {
  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">Loading…</div>
}

/**
 * Requires a signed-in user (optionally with one of `roles`). A visitor who is
 * not signed in is sent to `loginPath` and brought back here afterwards.
 * UX only: the backend enforces real authorization on every request.
 */
export function ProtectedRoute({ roles, loginPath = '/login' }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />
  if (!user) return <Navigate to={loginUrl(location.pathname + location.search, loginPath)} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** Login/register pages: a signed-in user is sent on to ?next=, or to their own home. */
export function GuestRoute() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()

  if (loading) return <PageLoader />
  if (user) return <Navigate to={safeNext(params.get('next'), homeFor(user.role))} replace />
  return <Outlet />
}