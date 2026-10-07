import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import PageTransition from './ui/PageTransition'
import StoreNavbar from './layout/StoreNavbar'
import StoreFooter from './layout/StoreFooter'

export default function StoreLayout() {
  const { user } = useAuth()

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

      <StoreFooter />
    </div>
  )
}
