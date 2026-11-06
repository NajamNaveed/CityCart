import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ExternalLink, CalendarClock, CalendarDays, LayoutDashboard, LogOut, MapPin, Menu as MenuIcon, Settings, Sparkles, Star, Wallet, Wrench } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import BillingAlert from '../billing/BillingAlert'
import NotificationBell from '../NotificationBell'
import Drawer from '../ui/Drawer'

// [path, label, end-exact, icon]
const NAV = [
  ['/provider', 'Overview', true, LayoutDashboard],
  ['/provider/bookings', 'Bookings', false, CalendarClock],
  ['/provider/offerings', 'Services & prices', false, Wrench],
  ['/provider/availability', 'Working hours', false, CalendarDays],
  ['/provider/reviews', 'Reviews', false, Star],
  ['/provider/billing', 'Billing', false, Wallet],
  ['/provider/profile', 'Service profile', false, Settings],
  ['/provider/area', 'Service area', false, MapPin],
]

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((w) => w[0].toUpperCase())
    .join('')
}

const sideLink = ({ isActive }) =>
  `flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
    isActive ? 'bg-pine text-white shadow-sm shadow-pine/25' : 'text-ink/70 hover:bg-paper hover:text-ink'
  }`

function SidebarNav({ onNavigate }) {
  return (
    <nav aria-label="Provider dashboard" className="space-y-1">
      {NAV.map(([to, label, end, Icon]) => (
        <NavLink key={to} to={to} end={end} className={sideLink} onClick={onNavigate}>
          {({ isActive }) => (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  isActive ? 'bg-white/15 text-white' : 'bg-paper text-ink/60'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function ProviderLayout() {
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pending = user?.provider?.status === 'PENDING'

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-paper lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <Link to="/provider" className="flex shrink-0 items-baseline gap-2">
              <span className="text-[20px] font-semibold tracking-tight text-ink sm:text-[21px]">
                citycart<span className="text-pine">.</span>
              </span>
              <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-pine sm:inline">
                service provider
              </span>
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink/70 transition hover:bg-paper hover:text-ink md:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              View shop
            </Link>
            <NotificationBell />
            <span className="hidden items-center gap-2 rounded-md py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine text-[12px] font-semibold text-white">
                {initials(user.name)}
              </span>
              <span className="hidden max-w-32 truncate text-[13px] font-medium text-ink sm:block">{user.name}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink/70 transition hover:bg-paper hover:text-clay"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <BillingAlert billingPath="/provider/billing" />

      {pending && (
        <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-sm text-warning">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your application is waiting for CityCart review. Customers cannot find you yet.
        </div>
      )}

      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto overscroll-contain border-r border-line bg-white px-4 py-6 lg:block">
          <SidebarNav />
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Provider dashboard">
        <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        <div className="mt-6 border-t border-line pt-5">
          <Link
            to="/"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink/70 transition hover:bg-paper hover:text-ink"
          >
            <ExternalLink className="h-4 w-4 text-muted" aria-hidden="true" />
            View shop
          </Link>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false)
              logout()
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13.5px] font-medium text-clay transition hover:bg-paper"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </Drawer>
    </div>
  )
}
