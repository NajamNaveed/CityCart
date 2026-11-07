import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNearby } from '../hooks/useNearby'
import { useFirstVisitDetect } from '../hooks/useFirstVisitDetect'
import PageTransition from './ui/PageTransition'
import StoreNavbar from './layout/StoreNavbar'
import StoreFooter from './layout/StoreFooter'

// v3 surfaces carry their own canvas and bottom spacing, so the footer meets
// them directly instead of leaving a strip of page background above it.
const isV3Surface = (pathname) =>
  pathname === '/' ||
  pathname === '/nearby' ||
  pathname.startsWith('/store/') ||
  pathname.startsWith('/product/') ||
  pathname === '/cart' ||
  pathname === '/checkout' ||
  pathname === '/order-placed' ||
  pathname === '/orders' ||
  pathname.startsWith('/orders/')

export default function StoreLayout() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const { autoDetect } = useNearby()
  // Shoppers (guests and customers) are asked for their location once, on a first visit.
  useFirstVisitDetect(autoDetect, !user || user.role === 'CUSTOMER')

  return (
    <div className="flex min-h-screen flex-col">
      <StoreNavbar />

      {user?.access?.restricted && (
        <div className="bg-clay px-4 py-2 text-center text-sm text-white">
          This brand has been terminated. The account is read-only until{' '}
          {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}

      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <StoreFooter flush={isV3Surface(pathname)} />
    </div>
  )
}
