import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { wrap } from '../../ui'

const NAV = [
  ['/brand', 'Overview', true],
  ['/brand/products', 'Products', false],
  ['/brand/categories', 'Categories', false],
  ['/brand/orders', 'Orders', false],
]

const navClass = ({ isActive }) =>
  `whitespace-nowrap border-b-2 px-1 py-3 text-[13px] font-medium transition lg:border-b-0 lg:border-l-2 lg:py-2 lg:pl-4 ${
    isActive ? 'border-pine text-pine' : 'border-transparent text-muted hover:text-ink'
  }`

export default function BrandLayout() {
  const { user, logout } = useAuth()

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

      <div className={`${wrap} grid flex-1 gap-x-12 py-8 lg:grid-cols-[11rem_1fr]`}>
        <nav aria-label="Dashboard" className="-mx-5 flex gap-5 overflow-x-auto border-b border-line px-5 lg:mx-0 lg:block lg:space-y-1 lg:border-0 lg:px-0">
          {NAV.map(([to, label, end]) => (
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