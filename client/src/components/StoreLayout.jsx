import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { useCity } from '../hooks/useCity'
import NotificationBell from './NotificationBell'
import { homeFor } from '../utils/nav'
import { wrap } from '../ui'

const navLink = ({ isActive }) =>
  `text-[13px] font-medium transition hover:text-clay ${isActive ? 'text-clay' : 'text-ink'}`

export default function StoreLayout() {
  const { user, logout } = useAuth()
  const { itemCount } = useCart()
  const { cities, cityId, setCityId } = useCity()
  const navigate = useNavigate()

  function onSearch(e) {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q').toString().trim()
    navigate(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-ink px-4 py-2 text-center text-[12px] tracking-wide text-cream/90">
        Cash on delivery on every order
      </div>

      <header className="sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur">
        <div className={`${wrap} flex flex-wrap items-center gap-x-8 gap-y-3 py-4`}>
          <Link to="/" className="text-[24px] font-semibold tracking-tight">
            citycart<span className="text-clay">.</span>
          </Link>

          <form onSubmit={onSearch} role="search" className="order-last w-full md:order-none md:max-w-xl md:flex-1">
            <label htmlFor="site-search" className="sr-only">
              Search products
            </label>
            <div className="relative">
              <input
                id="site-search"
                name="q"
                type="search"
                placeholder="Search products"
                className="h-11 w-full rounded-sm border border-line bg-paper pl-4 pr-24 text-sm outline-none transition focus:border-ink"
              />
              <button
                type="submit"
                className="absolute right-0 top-0 h-11 px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-clay hover:text-clay-dark"
              >
                Search
              </button>
            </div>
          </form>

          <nav className="ml-auto flex items-center gap-6">
            <div className="hidden sm:block">
              <label htmlFor="city-select" className="sr-only">
                City
              </label>
              <select
                id="city-select"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="h-9 rounded-sm border border-line bg-paper px-2.5 text-[13px] outline-none focus:border-ink"
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <NavLink to="/shop" className={navLink}>
              Shop
            </NavLink>

            {user ? (
              <>
                <NotificationBell />
                {user.role !== 'CUSTOMER' && (
                  <NavLink to={homeFor(user.role)} className={navLink}>
                    Dashboard
                  </NavLink>
                )}
                {user.role === 'CUSTOMER' && (
                  <>
                    <NavLink to="/orders" className={navLink}>
                      Orders
                    </NavLink>
                    <NavLink to="/cart" className={navLink}>
                      Cart{itemCount > 0 ? ` (${itemCount})` : ''}
                    </NavLink>
                  </>
                )}
                <button type="button" onClick={logout} className="text-[13px] font-medium hover:text-clay">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/sell" className="hidden text-[13px] font-medium text-pine hover:text-clay lg:inline">
                  Sell on CityCart
                </Link>
                <NavLink to="/login" className={navLink}>
                  Sign in
                </NavLink>
                <Link
                  to="/register"
                  className="hidden h-9 items-center rounded-sm bg-ink px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-cream transition hover:bg-black sm:inline-flex"
                >
                  Register
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

      <footer className="mt-24 bg-ink text-cream/80">
        <div className={`${wrap} grid gap-10 py-14 md:grid-cols-[2fr_1fr_1fr]`}>
          <div>
            <p className="text-[22px] font-semibold tracking-tight text-cream">
              citycart<span className="text-clay">.</span>
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed">
              A marketplace for local brands. Shop by city, fill one cart from several brands, and pay when your
              order arrives.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/50">Shop</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link to="/shop" className="hover:text-cream">
                  All products
                </Link>
              </li>
              <li>
                <Link to="/#brands" className="hover:text-cream">
                  Brands
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-cream/50">Account</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-cream">
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-cream">
                  Create an account
                </Link>
              </li>
              <li>
                <Link to="/cart" className="hover:text-cream">
                  Cart
                </Link>
              </li>
              <li>
                <Link to="/sell" className="hover:text-cream">
                  Sell on CityCart
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-cream/50">
          © {new Date().getFullYear()} CityCart
        </div>
      </footer>
    </div>
  )
}