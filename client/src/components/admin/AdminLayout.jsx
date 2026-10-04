import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { wrap } from '../../ui'

const NAV = [
  ['/admin', 'Overview', true],
  ['/admin/brands', 'Brands', false],
  ['/admin/orders', 'Orders', false],
  ['/admin/cities', 'Cities', false],
]

const navClass = ({ isActive }) =>
  `block whitespace-nowrap border-b-2 px-1 py-3 text-[13px] font-medium transition lg:border-b-0 lg:border-l-2 lg:py-2 lg:pl-4 ${
    isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
  }`

export default function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-cream">
        <div className={`${wrap} flex items-center gap-6 py-4`}>
          <Link to="/admin" className="flex items-baseline gap-2">
            <span className="text-[22px] font-semibold tracking-tight">
              citycart<span className="text-clay">.</span>
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">administration</span>
          </Link>
          <div className="ml-auto flex items-center gap-5 text-[13px]">
            <span className="hidden text-muted sm:inline">{user.name}</span>
            <button type="button" onClick={logout} className="font-medium hover:text-clay">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className={`${wrap} grid flex-1 gap-x-12 py-8 lg:grid-cols-[11rem_1fr] lg:items-start`}>
        <nav
          aria-label="Administration"
          className="-mx-5 flex gap-5 overflow-x-auto border-b border-line px-5 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
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