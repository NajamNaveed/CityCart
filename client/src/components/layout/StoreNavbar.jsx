import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell, Check, ChevronDown, LayoutDashboard, LogOut, MapPin, Menu as MenuIcon, Package, Search, ShoppingBag } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCart } from '../../hooks/useCart'
import { useCity } from '../../hooks/useCity'
import useNotifications from '../../hooks/useNotifications'
import NotificationBell from '../NotificationBell'
import Drawer from '../ui/Drawer'
import Menu from '../ui/Menu'
import { homeFor } from '../../utils/nav'

const navLink = ({ isActive }) =>
  `relative text-[13.5px] font-medium transition-colors after:absolute after:-bottom-1.5 after:left-1/2 after:h-0.5 after:w-0 after:-translate-x-1/2 after:rounded-full after:bg-clay after:transition-all after:duration-300 ${
    isActive ? 'text-ink after:w-5' : 'text-ink/55 hover:text-ink'
  }`

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function SearchForm({ className = '', autoFocus = false, onSubmitted }) {
  const navigate = useNavigate()

  function onSubmit(e) {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q').toString().trim()
    navigate(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop')
    onSubmitted?.()
  }

  return (
    <form onSubmit={onSubmit} role="search" className={className}>
      <label className="sr-only" htmlFor="site-search">
        Search products
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="site-search"
          name="q"
          type="search"
          autoFocus={autoFocus}
          placeholder="Search products…"
          className="h-9.5 w-full rounded-md border border-line bg-paper pl-9 pr-3.5 text-[13px] text-ink placeholder-muted/50 outline-none transition focus:w-72 focus:border-ink focus:bg-white focus:ring-2 focus:ring-ink/10"
        />
      </div>
    </form>
  )
}

function CartLink() {
  const { itemCount } = useCart()
  return (
    <Link
      to="/cart"
      aria-label={`Cart${itemCount > 0 ? ` (${itemCount} items)` : ''}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-paper"
    >
      <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
      {itemCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none text-white">
          {itemCount > 9 ? '9+' : itemCount}
        </span>
      )}
    </Link>
  )
}

function OrdersLink() {
  return (
    <Link
      to="/orders"
      aria-label="My orders"
      className="flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-paper"
    >
      <Package className="h-[18px] w-[18px]" aria-hidden="true" />
    </Link>
  )
}

function MenuLink({ to, icon: Icon, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-ink transition hover:bg-paper"
    >
      <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
      {children}
    </NavLink>
  )
}

function AccountMenu({ user, logout }) {
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
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="hidden max-w-28 truncate text-[13px] font-medium text-ink sm:block">{user.name}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    >
      {({ close }) => (
        <div className="py-1.5">
          <p className="border-b border-line px-3.5 pb-2 pt-1">
            <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
            <span className="block truncate text-[11.5px] text-muted">{user.email}</span>
          </p>
          <div className="pt-1.5">
            {user.role !== 'CUSTOMER' && (
              <MenuLink to={homeFor(user.role)} icon={LayoutDashboard} onClick={close}>
                Dashboard
              </MenuLink>
            )}
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

function DrawerLink({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="block rounded-md px-3 py-2.5 text-[14px] font-medium text-ink transition hover:bg-paper"
    >
      {children}
    </NavLink>
  )
}

// The drawer's city picker: a real list instead of a native select, so every
// option renders the same way everywhere. Active city gets a clay check.
function DrawerCityList() {
  const { cities, cityId, setCityId } = useCity()
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">City</p>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setCityId('')}
          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
            !cityId ? 'bg-paper font-semibold text-ink' : 'text-ink/70 hover:bg-paper hover:text-ink'
          }`}
        >
          All cities
          {!cityId && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
        </button>
        {cities.map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => setCityId(c._id)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
              cityId === c._id
                ? 'bg-paper font-semibold text-ink'
                : 'text-ink/70 hover:bg-paper hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              {c.name}
            </span>
            {cityId === c._id && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// The navbar's city picker (large screens): same choices as the drawer's list,
// as a dropdown so it stays compact next to the search field.
function CityMenu() {
  const { cities, city, cityId, setCityId } = useCity()
  return (
    <Menu
      width="w-60"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`City: ${city ? city.name : 'All cities'}`}
          className="flex h-9 max-w-36 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink transition hover:bg-paper"
        >
          <MapPin className="h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
          <span className="truncate">{city ? city.name : 'All cities'}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    >
      {({ close }) => (
        <div className="max-h-72 space-y-1 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => {
              setCityId('')
              close()
            }}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
              !cityId ? 'bg-paper font-semibold text-ink' : 'text-ink/70 hover:bg-paper hover:text-ink'
            }`}
          >
            All cities
            {!cityId && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
          </button>
          {cities.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => {
                setCityId(c._id)
                close()
              }}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px] transition ${
                cityId === c._id
                  ? 'bg-paper font-semibold text-ink'
                  : 'text-ink/70 hover:bg-paper hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                {c.name}
              </span>
              {cityId === c._id && <Check className="h-3.5 w-3.5 text-clay" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </Menu>
  )
}

// Bell / orders / cart as tiles inside the drawer (small screens only reach them here).
function QuickAccess() {
  const { user } = useAuth()
  const { itemCount } = useCart()
  const { unreadCount } = useNotifications()
  const isCustomer = user?.role === 'CUSTOMER'

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Quick access</p>
      <div className={`grid gap-2.5 ${isCustomer ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <DrawerTile to="/notifications" icon={Bell} label="Alerts" badge={unreadCount} />
        {isCustomer && <DrawerTile to="/orders" icon={Package} label="Orders" />}
        {isCustomer && <DrawerTile to="/cart" icon={ShoppingBag} label="Cart" badge={itemCount} />}
      </div>
    </div>
  )
}

function DrawerTile({ to, icon: Icon, label, badge = 0, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="relative flex flex-col items-center gap-1.5 rounded-md border border-line bg-white px-2 py-3 text-ink transition hover:border-ink"
    >
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden="true" />
        {badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </NavLink>
  )
}

export default function StoreNavbar() {
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isStaff = user && user.role !== 'CUSTOMER'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-md text-ink transition hover:bg-paper lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link to="/" className="text-[22px] font-semibold tracking-tight text-ink">
            citycart<span className="text-clay">.</span>
          </Link>
          {/* Mirrors DrawerCityList above lg; small screens pick a city in the drawer.
              Lives beside the logo because the right cluster has no room to spare. */}
          <div className="ml-2 hidden lg:block">
            <CityMenu />
          </div>
        </div>

        {/* Centred between the two side clusters; drops to the drawer below lg */}
        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          <NavLink to="/" end className={navLink}>
            Home
          </NavLink>
          <NavLink to="/shop" className={navLink}>
            Shop
          </NavLink>
          <NavLink to="/brands" className={navLink}>
            Brands
          </NavLink>
        </nav>

        <div className="flex items-center justify-end gap-1.5">
          <SearchForm className="hidden w-44 lg:block" />
          <span className="mx-1 hidden h-5 w-px bg-line lg:block" aria-hidden="true" />
          {/* On small screens these three live inside the menu drawer instead. */}
          <div className="hidden items-center gap-1.5 lg:flex">
            <NotificationBell />
            {user?.role === 'CUSTOMER' && (
              <>
                <OrdersLink />
                <CartLink />
              </>
            )}
          </div>

          {user ? (
            // On small screens the account lives inside the menu drawer instead.
            <div className="hidden lg:block">
              <AccountMenu user={user} logout={logout} />
            </div>
          ) : (
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
              <Link
                to="/login"
                className="whitespace-nowrap rounded-md px-3.5 py-2 text-[13.5px] font-medium text-ink transition hover:bg-paper"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="ml-1 inline-flex h-9 items-center whitespace-nowrap rounded-md bg-ink px-4 text-[12.5px] font-medium tracking-wide text-white transition hover:bg-ink-soft"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu">
        <div className="space-y-5">
          <SearchForm autoFocus onSubmitted={() => setDrawerOpen(false)} />
          <DrawerCityList />
          {user && <QuickAccess />}

          <nav aria-label="Mobile" className="space-y-1 border-t border-line pt-4">
            <DrawerLink to="/" onClick={() => setDrawerOpen(false)}>
              Home
            </DrawerLink>
            <DrawerLink to="/shop" onClick={() => setDrawerOpen(false)}>
              Shop
            </DrawerLink>
            <DrawerLink to="/brands" onClick={() => setDrawerOpen(false)}>
              Brands
            </DrawerLink>
            {user?.role === 'CUSTOMER' && (
              <DrawerLink to="/orders" onClick={() => setDrawerOpen(false)}>
                My orders
              </DrawerLink>
            )}
            {isStaff && (
              <DrawerLink to={homeFor(user.role)} onClick={() => setDrawerOpen(false)}>
                Dashboard
              </DrawerLink>
            )}
          </nav>

          <div className="border-t border-line pt-5">
            {user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">{user.name}</p>
                    <p className="truncate text-[12px] text-muted">{user.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-line px-4 py-2.5 text-[13px] font-medium text-clay transition hover:bg-paper"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Link
                  to="/login"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-11 w-full items-center justify-center rounded-md bg-ink text-[13px] font-medium uppercase tracking-[0.08em] text-white transition hover:bg-ink-soft"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-11 w-full items-center justify-center rounded-md border border-ink text-[13px] font-medium uppercase tracking-[0.08em] text-ink transition hover:bg-ink hover:text-white"
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </header>
  )
}
