import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  ShoppingBag,
  Wrench,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Drawer from './ui/Drawer'
import Menu from './ui/Menu'
import { Button, btn, shell } from '../design'
import { homeFor } from '../utils/nav'

const navLink = ({ isActive }) =>
  `relative text-[13px] font-medium transition-colors ${
    isActive ? 'text-ink' : 'text-ink/55 hover:text-ink'
  }`

const menuItem = 'block rounded-tile px-3 py-2.5 transition-colors hover:bg-canvas'
const drawerHeading = 'px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/40'
const drawerLink =
  'flex items-center gap-2.5 rounded-tile px-3 py-2.5 text-[13.5px] font-medium text-ink transition hover:bg-canvas'

function DoorItems({ close, kind }) {
  const doors =
    kind === 'login'
      ? [
          { to: '/sell/login', title: 'Brand log in', note: 'Run your store workspace' },
          { to: '/sell/service/login', title: 'Provider log in', note: 'Manage your service work' },
        ]
      : [
          { to: '/sell/apply', title: 'Sell products', note: 'Open a brand storefront' },
          { to: '/provider/apply', title: 'Offer services', note: 'Join as a local provider' },
        ]
  return (
    <div className="p-1.5">
      {doors.map((door) => (
        <Link key={door.to} to={door.to} onClick={close} className={menuItem}>
          <span className="block text-[13px] font-medium text-ink">{door.title}</span>
          <span className="mt-0.5 block text-[11.5px] text-ink/55">{door.note}</span>
        </Link>
      ))}
    </div>
  )
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cream/40">{title}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  )
}

function FooterLink({ to, children }) {
  return (
    <li>
      <Link to={to} className="text-[13px] text-cream/55 transition-colors hover:text-cream">
        {children}
      </Link>
    </li>
  )
}

export default function SellerLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isSeller = user && user.role !== 'CUSTOMER'
  // The same shell serves the brand and provider doors; the copy follows the door.
  const services = pathname.startsWith('/provider') || pathname.startsWith('/sell/service')
  const door = pathname === '/sell' ? 'For sellers' : services ? 'For providers' : 'For brands'

  const closeMenu = () => setMobileOpen(false)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#seller-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-tile focus:bg-noir focus:px-4 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-cream"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line-warm bg-paper-warm/90 backdrop-blur-md">
        <div className={`${shell} flex h-16 items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              aria-label="Open seller menu"
              onClick={() => setMobileOpen(true)}
              className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-tile text-ink transition hover:bg-canvas lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <Link
              to="/sell"
              aria-label="CityCart for sellers"
              className="inline-flex min-w-0 items-baseline gap-2"
            >
              <span className="text-[22px] font-semibold tracking-tight text-ink">
                CityCart<span className="text-clay">.</span>
              </span>
              <span className="hidden rounded-full border border-line-warm bg-sand/60 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink/55 sm:inline">
                {door}
              </span>
            </Link>
          </div>

          <nav aria-label="Seller" className="hidden items-center gap-7 lg:flex">
            {isSeller && (
              <NavLink to={homeFor(user.role)} className={navLink}>
                Dashboard
              </NavLink>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/"
              className="mr-1 hidden items-center gap-1 text-[12.5px] font-medium text-ink/55 transition-colors hover:text-ink xl:flex"
            >
              Shop CityCart
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            {isSeller ? (
              <>
                <Button tone="outline" size="sm" onClick={logout} className="hidden sm:inline-flex">
                  Sign out
                </Button>
                <Button to={homeFor(user.role)} tone="noir" size="sm">
                  Dashboard
                </Button>
              </>
            ) : (
              <>
                <div className="hidden sm:block">
                  <Menu
                    width="w-60"
                    trigger={({ open, toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        className="inline-flex items-center gap-1.5 rounded-tile px-3 py-2 text-[12.5px] font-medium text-ink/70 transition-colors hover:bg-canvas hover:text-ink"
                      >
                        Log in
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                    )}
                  >
                    {({ close }) => <DoorItems close={close} kind="login" />}
                  </Menu>
                </div>
                <Menu
                  width="w-60"
                  trigger={({ open, toggle }) => (
                    <button
                      type="button"
                      onClick={toggle}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className={`${btn('noir', 'sm')} px-3 text-[10.5px] sm:px-4 sm:text-[11px]`}
                    >
                      Get started
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  )}
                >
                  {({ close }) => <DoorItems close={close} kind="apply" />}
                </Menu>
              </>
            )}
          </div>
        </div>
      </header>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="Sell on CityCart">
        <div className="space-y-5">
          <nav aria-label="Seller mobile" className="space-y-1">
            <p className={drawerHeading}>Get started</p>
            <Link to="/sell/apply" onClick={closeMenu} className={drawerLink}>
              <ShoppingBag className="h-4 w-4 text-clay" aria-hidden="true" />
              Sell products
            </Link>
            <Link to="/provider/apply" onClick={closeMenu} className={drawerLink}>
              <Wrench className="h-4 w-4 text-clay" aria-hidden="true" />
              Offer services
            </Link>
            <p className={`${drawerHeading} pt-4`}>Log in</p>
            <Link to="/sell/login" onClick={closeMenu} className={drawerLink}>
              <LogIn className="h-4 w-4 text-clay" aria-hidden="true" />
              Brand log in
            </Link>
            <Link to="/sell/service/login" onClick={closeMenu} className={drawerLink}>
              <LogIn className="h-4 w-4 text-clay" aria-hidden="true" />
              Provider log in
            </Link>
            <p className={`${drawerHeading} pt-4`}>CityCart</p>
            <Link to="/" onClick={closeMenu} className={drawerLink}>
              <ArrowUpRight className="h-4 w-4 text-clay" aria-hidden="true" />
              Shop CityCart
            </Link>
          </nav>

          <div className="space-y-2 border-t border-line-warm pt-5">
            {isSeller ? (
              <>
                <Button to={homeFor(user.role)} tone="noir" size="md" className="w-full" onClick={closeMenu}>
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  Go to dashboard
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-tile border border-line-warm px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-clay transition hover:bg-canvas"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Button to="/sell/apply" tone="noir" size="md" className="w-full" onClick={closeMenu}>
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  Sell products
                </Button>
                <Button to="/provider/apply" tone="outline" size="md" className="w-full" onClick={closeMenu}>
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  Offer services
                </Button>
              </>
            )}
          </div>
        </div>
      </Drawer>

      {user?.access?.restricted && (
        <div className="bg-clay px-4 py-2 text-center text-[12.5px] text-white">
          This brand has been terminated. The account is read-only until{' '}
          {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}

      <main id="seller-content" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-noir text-cream">
        <div className={`${shell} py-12 sm:py-14`}>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <p className="text-[22px] font-semibold tracking-tight">
                CityCart<span className="text-clay">.</span>
              </p>
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-cream/50">
                The block marketplace. Local stores, verified pros, cash at the door — all within 1.5 km.
              </p>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-cream/40">
                For sellers
              </p>
            </div>
            <FooterColumn title="Sell products">
              <FooterLink to="/sell/apply">Open your store</FooterLink>
              <FooterLink to="/sell/login">Brand log in</FooterLink>
              <FooterLink to="/sell">How selling works</FooterLink>
            </FooterColumn>
            <FooterColumn title="Offer services">
              <FooterLink to="/provider/apply">Apply as a provider</FooterLink>
              <FooterLink to="/sell/service/login">Provider log in</FooterLink>
              <FooterLink to="/services">Shop services</FooterLink>
            </FooterColumn>
            <FooterColumn title="CityCart">
              <FooterLink to="/">Shop the marketplace</FooterLink>
              <FooterLink to="/login">Customer sign in</FooterLink>
              <FooterLink to="/register">Create an account</FooterLink>
            </FooterColumn>
          </div>
          <div className="mt-11 flex flex-wrap items-center justify-between gap-3 border-t border-cream/10 pt-5 text-[11.5px] text-cream/40">
            <p>© {new Date().getFullYear()} CityCart. All rights reserved.</p>
            <Link to="/" className="inline-flex items-center gap-1.5 transition-colors hover:text-cream">
              Shop CityCart
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
