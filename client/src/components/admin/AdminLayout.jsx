import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, LogOut, MapPin, Menu as MenuIcon, Package, ShieldCheck, Star, Store } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import NotificationBell from '../NotificationBell'
import Drawer from '../ui/Drawer'

const NAV = [
  ['/admin', 'Overview', true, LayoutDashboard],
  ['/admin/brands', 'Brands', false, Store],
  ['/admin/orders', 'Orders', false, Package],
  ['/admin/reviews', 'Reviews', false, Star],
  ['/admin/cities', 'Cities', false, MapPin],
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
    isActive ? 'bg-ink text-white shadow-sm shadow-ink/25' : 'text-ink/70 hover:bg-paper hover:text-ink'
  }`

function SidebarNav({ onNavigate }) {
  return (
    <nav aria-label="Administration" className="space-y-1">
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

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-5 lg:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-paper lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <Link to="/admin" className="flex items-baseline gap-2">
            <span className="text-[21px] font-semibold tracking-tight text-ink">
              citycart<span className="text-clay">.</span>
            </span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-clay sm:inline">
              platform admin
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell />
            <span className="hidden items-center gap-2 rounded-md py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
                {initials(user.name)}
              </span>
              <span className="hidden text-[13px] font-medium text-ink sm:block">{user.name}</span>
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

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-line bg-white px-4 py-6 lg:block">
          <SidebarNav />
          <p className="mt-6 flex items-center gap-2 rounded-md bg-paper px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            <ShieldCheck className="h-4 w-4 shrink-0 text-ink/60" aria-hidden="true" />
            Actions here affect the whole platform.
          </p>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile navigation drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Platform admin">
        <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        <div className="mt-6 border-t border-line pt-5">
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
