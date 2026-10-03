import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { btnPine, wrap } from '../ui'
import { homeFor } from '../utils/nav'

const navLink = ({ isActive }) =>
  `text-[13px] font-medium transition hover:text-pine ${isActive ? 'text-pine' : 'text-ink'}`

export default function SellerLayout() {
  const { user, logout } = useAuth()
  const isSeller = user && user.role !== 'CUSTOMER'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur">
        <div className={`${wrap} flex items-center gap-8 py-4`}>
          <Link to="/sell" className="flex items-baseline gap-2">
            <span className="text-[24px] font-semibold tracking-tight">
              citycart<span className="text-pine">.</span>
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">for brands</span>
          </Link>

          <nav className="ml-auto flex items-center gap-6">
            <Link to="/" className="hidden text-[13px] font-medium hover:text-pine sm:inline">
              Shop CityCart
            </Link>
            {isSeller ? (
              <>
                <NavLink to={homeFor(user.role)} className={navLink}>
                  Dashboard
                </NavLink>
                <button type="button" onClick={logout} className="text-[13px] font-medium hover:text-pine">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/sell/login" className={navLink}>
                  Brand log in
                </NavLink>
                <Link to="/sell/apply" className={`${btnPine} h-9 px-4 text-[12px]`}>
                  Open your brand
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {user?.access?.restricted && (
        <div className="bg-clay px-4 py-2 text-center text-sm text-cream">
          This brand has been terminated. The account is read-only until{' '}
          {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-pine text-cream/75">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-8 text-sm`}>
          <p>
            <span className="font-semibold text-cream">
              citycart<span className="opacity-60">.</span>
            </span>{' '}
            for brands
          </p>
          <p className="text-cream/50">© {new Date().getFullYear()} CityCart</p>
        </div>
      </footer>
    </div>
  )
}