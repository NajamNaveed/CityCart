import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, LayoutDashboard, LogIn, LogOut, Menu as MenuIcon, ShoppingBag, Store } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Drawer from './ui/Drawer'
import { btnPine, wrap } from '../ui'
import { homeFor } from '../utils/nav'

const navLink = ({ isActive }) =>
  `text-[13px] font-medium transition-colors ${
    isActive ? 'text-pine' : 'text-ink/60 hover:text-ink'
  }`

export default function SellerLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isSeller = user && user.role !== 'CUSTOMER'
  // The same shell serves the brand and provider doors; the copy follows the door.
  const services = pathname.startsWith('/provider') || pathname.startsWith('/sell/service')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className={`${wrap} flex h-16 items-center justify-between gap-4`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open brand menu"
              onClick={() => setMobileOpen(true)}
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-paper sm:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <Link to="/sell" className="flex items-baseline gap-2 shrink-0">
              <span className="text-[20px] font-semibold tracking-tight text-ink sm:text-[22px]">
                citycart<span className="text-pine">.</span>
              </span>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-pine sm:text-[11px]">
                {services ? 'for providers' : 'for brands'}
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-6 sm:flex">
            <Link to="/" className="text-[13px] font-medium text-ink/60 transition hover:text-ink">
              Shop CityCart
            </Link>
            {isSeller ? (
              <>
                <NavLink to={homeFor(user.role)} className={navLink}>
                  Dashboard
                </NavLink>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[12.5px] font-medium text-ink transition hover:border-ink"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to={services ? '/sell/service/login' : '/sell/login'} className={navLink}>
                  {services ? 'Provider log in' : 'Brand log in'}
                </NavLink>
                <Link to={services ? '/provider/apply' : '/sell/apply'} className={`${btnPine} h-9 px-4 text-[12px]`}>
                  {services ? 'Offer a service' : 'Open your brand'}
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Quick Action */}
          <div className="flex items-center gap-2 sm:hidden">
            {isSeller ? (
              <Link
                to={homeFor(user.role)}
                className="inline-flex h-8 items-center rounded-md bg-pine px-3 text-[11.5px] font-medium uppercase tracking-wider text-white"
              >
                Dashboard
              </Link>

            ) : (
              <Link
                to={services ? '/provider/apply' : '/sell/apply'}
                className="inline-flex h-8 items-center rounded-md bg-pine px-3 text-[11.5px] font-medium uppercase tracking-wider text-white"
              >
                {services ? 'Offer service' : 'Open brand'}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={services ? 'Provider portal' : 'Brand portal'}>
        <div className="space-y-4">
          <div className="space-y-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink/70 transition hover:bg-paper hover:text-ink"
            >
              <ShoppingBag className="h-4 w-4 text-muted" />
              Shop CityCart Marketplace
            </Link>
            <Link
              to="/sell"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 rounded-md bg-cream/50 px-3 py-2.5 text-[13.5px] font-medium text-pine transition hover:bg-cream"
            >
              <Store className="h-4 w-4 text-pine" />
              Sell on CityCart (Overview)
            </Link>
          </div>

          <div className="border-t border-line pt-4 space-y-2">
            {isSeller ? (
              <>
                <Link
                  to={homeFor(user.role)}
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-pine px-4 py-2.5 text-[13px] font-medium uppercase tracking-wider text-white"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Go to Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13.5px] font-medium text-clay transition hover:bg-paper"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to={services ? '/provider/apply' : '/sell/apply'}
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-pine px-4 py-2.5 text-[13px] font-medium uppercase tracking-wider text-white shadow-sm"
                >
                  {services ? 'Offer a service' : 'Open your brand'}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link
                  to={services ? '/sell/service/login' : '/sell/login'}
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-line px-4 py-2.5 text-[13px] font-medium text-ink transition hover:bg-paper"
                >
                  <LogIn className="h-4 w-4 text-muted" />
                  {services ? 'Provider log in' : 'Brand log in'}
                </Link>
              </>
            )}
          </div>
        </div>
      </Drawer>

      {user?.access?.restricted && (
        <div className="bg-clay px-4 py-2 text-center text-sm text-white">
          This brand has been terminated. The account is read-only until{' '}
          {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-pine text-white/75">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-8 text-sm`}>
          <p>
            <span className="font-semibold text-white">
              citycart<span className="opacity-60">.</span>
            </span>{' '}
            {services ? 'for providers' : 'for brands'}
          </p>
          <p className="text-white/50">© {new Date().getFullYear()} CityCart</p>
        </div>
      </footer>
    </div>
  )
}
