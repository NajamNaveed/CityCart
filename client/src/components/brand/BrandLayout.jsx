import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCan } from '../../hooks/useCan'
import { wrap } from '../../ui'

// [path, label, exact match, permission needed to see it (null = everyone on the team)]
const NAV = [
  ['/brand', 'Overview', true, null],
  ['/brand/products', 'Products', false, 'products.view'],
  ['/brand/categories', 'Categories', false, 'categories.view'],
  ['/brand/orders', 'Orders', false, 'orders.view'],
  ['/brand/deliveries', 'Deliveries', false, 'delivery.view'],
  ['/brand/team', 'Team', false, 'employees.view'],
]

const navClass = ({ isActive }) =>
  `block whitespace-nowrap border-b-2 px-1 py-3 text-[13px] font-medium transition lg:border-b-0 lg:border-l-2 lg:py-2 lg:pl-4 ${
    isActive ? 'border-pine text-pine' : 'border-transparent text-muted hover:text-ink'
  }`

export default function BrandLayout() {
  const { user, logout } = useAuth()
  const can = useCan()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className={`${wrap} flex items-center gap-6 py-4`}>
          <Link to="/brand" className="flex items-baseline gap-2">
            <span className="text-[22px] font-semibold tracking-tight">
              citycart<span className="text-pine">.</span>
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-pine">dashboard</span>
          </Link>
          <div className="ml-auto flex items-center gap-5 text-[13px]">
            <Link to="/" className="font-medium hover:text-pine">
              View shop
            </Link>
            <span className="hidden text-muted sm:inline">{user.name}</span>
            <button type="button" onClick={logout} className="font-medium hover:text-pine">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {user.access?.restricted && (
        <div className="bg-clay px-4 py-2 text-center text-sm text-cream">
          This brand has been terminated. The account is read-only until {new Date(user.access.expiresAt).toLocaleString()}.
        </div>
      )}

      <div className={`${wrap} grid flex-1 gap-x-12 py-8 lg:grid-cols-[11rem_1fr] lg:items-start`}>
        {/* A row of tabs on small screens, a vertical menu from lg up. */}
        <nav
          aria-label="Dashboard"
          className="-mx-5 flex gap-5 overflow-x-auto border-b border-line px-5 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {NAV.filter(([, , , permission]) => !permission || can(permission)).map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 pt-6 lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}