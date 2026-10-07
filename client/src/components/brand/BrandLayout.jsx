import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  ShoppingBag,
  Star,
  Truck,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import NotificationBell from '../NotificationBell'
import Drawer from '../ui/Drawer'
import Menu from '../ui/Menu'

// [path, label, end-exact, permission (null = everyone on the team)]
const NAV = [
  ['/brand', 'Overview', true, null, LayoutDashboard],
  ['/brand/products', 'Products', false, 'products.view', ShoppingBag],
  ['/brand/categories', 'Categories', false, 'categories.view', UtensilsCrossed],
  ['/brand/orders', 'Orders', false, 'orders.view', Package],
  ['/brand/deliveries', 'Deliveries', false, 'delivery.view', Truck],
  ['/brand/reviews', 'Reviews', false, 'products.view', Star],
  ['/brand/team', 'Team', false, 'employees.view', Users],
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
  const can = useCan()
  return (
    <nav aria-label="Dashboard" className="space-y-1">
      {NAV.filter(([, , , permission]) => !permission || can(permission)).map(([to, label, end, , Icon]) => (
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

function UserMenu({ user, logout }) {
  const navigate = useNavigate()
  return (
    <Menu
      width="w-60"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition hover:bg-paper"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine text-[12px] font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="hidden max-w-28 truncate text-[13px] font-medium text-ink sm:block">{user.name}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    >
      {({ close }) => (
        <div className="py-1.5">
          <p className="border-b border-line px-3.5 pb-2 pt-1">
            <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
            <span className="block truncate text-[11.5px] text-muted">{user.email}</span>
            {user.role === 'BRAND_EMPLOYEE' && (
              <span className="mt-1 inline-block rounded-md bg-paper px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted">
                Team member
              </span>
            )}
          </p>
          <div className="pt-1.5">
            <button
              type="button"
              onClick={() => {
                close()
                navigate('/')
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-ink transition hover:bg-paper"
            >
              <ExternalLink className="h-4 w-4 text-muted" aria-hidden="true" />
              View shop
            </button>
            <button
              type="button"
              onClick={() => {
                close()
                logout()
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-clay transition hover:bg-paper"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </Menu>
  )
}

export default function BrandLayout() {
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Top bar */}
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

          <Link to="/brand" className="flex items-baseline gap-2">
            <span className="text-[21px] font-semibold tracking-tight text-ink">
              citycart<span className="text-pine">.</span>
            </span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-pine sm:inline">
              dashboard
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to="/"
              className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink/70 transition hover:bg-paper hover:text-ink md:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              View shop
            </Link>
            <NotificationBell />
            <UserMenu user={user} logout={logout} />
          </div>
        </div>
      </header>

      {user.access?.restricted && (
        <div className="bg-clay px-4 py-2 text-center text-sm text-white">
          This brand has been terminated. The account is read-only until {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-line bg-white px-4 py-6 lg:block">
          <SidebarNav />
        </aside>

        {/* Page content */}
        <main className="min-w-0 flex-1 px-5 py-8 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile navigation drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Dashboard">
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
