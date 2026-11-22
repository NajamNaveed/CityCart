import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Bell,
  CalendarCheck,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useCart } from '../../hooks/useCart'
import { useChat } from '../../hooks/useChat'
import useNotifications from '../../hooks/useNotifications'
import NotificationBell from '../NotificationBell'
import Drawer from '../ui/Drawer'
import Menu from '../ui/Menu'
import VoiceSearchButton from '../ui/VoiceSearchButton'
import { homeFor } from '../../utils/nav'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/nearby', label: 'Stores' },
  { to: '/services', label: 'Services' },
]

const HIGHLIGHTS = [
  { icon: HandCoins, text: 'Cash at the door — no card needed' },
  { icon: MapPin, text: 'Every shop sits inside 1.5 km of your block' },
  { icon: Truck, text: 'Each store packs and delivers its own order' },
  { icon: ShieldCheck, text: 'Verified sellers and pros only' },
]

// The centre nav is a single floating pill; the active item is one shared
// layout element, so the ink slides between items instead of blinking.
function NavItem({ item }) {
  const reduced = useReducedMotion()
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className="relative isolate rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-pill"
              className="absolute inset-0 -z-10 rounded-full bg-noir shadow-[0_6px_18px_-8px_rgba(21,20,15,0.6)]"
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <span className={isActive ? 'text-cream' : 'text-ink/60 hover:text-ink'}>{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

// A slim strip of the promises above the header. It rotates in place; with
// reduced motion the first line simply stays put.
function Highlights() {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduced) return undefined
    const timer = setInterval(() => setIndex((n) => (n + 1) % HIGHLIGHTS.length), 4400)
    return () => clearInterval(timer)
  }, [reduced])

  const { icon: Icon, text } = HIGHLIGHTS[index]

  return (
    <div className="relative z-10 hidden bg-noir text-cream sm:block" aria-label="Why CityCart">
      <div className="mx-auto flex h-8 w-full max-w-7xl items-center justify-between gap-4 px-5 text-[11px]">
        <span className="flex min-w-0 items-center gap-2 text-cream/75">
          <Icon className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden="true" />
          {reduced ? (
            <span className="truncate">{HIGHLIGHTS[0].text}</span>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={text}
                className="truncate"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
              >
                {text}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 text-cream/45 md:flex">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-glow-sage text-glow-sage" aria-hidden="true" />
          Open on your street today
        </span>
      </div>
    </div>
  )
}

function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

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
  const inputRef = useRef(null)

  function onSubmit(e) {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q').toString().trim()
    navigate(q ? `/nearby?q=${encodeURIComponent(q)}` : '/nearby')
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
          ref={inputRef}
          autoFocus={autoFocus}
          placeholder="Search…"
          className="h-9.5 w-full rounded-full border border-line-warm bg-canvas/80 pl-9 pr-10 text-[13px] text-ink placeholder-muted/50 outline-none transition focus:border-gold/70 focus:bg-white focus:ring-2 focus:ring-gold/25"
        />
        <VoiceSearchButton
          className="absolute right-1 top-1/2 -translate-y-1/2"
          label="Search products by voice"
          onResult={(text) => {
            if (!inputRef.current) return
            inputRef.current.value = text
            inputRef.current.focus()
          }}
        />
      </div>
    </form>
  )
}

function CartLink({ quiet = false }) {
  const { itemCount } = useCart()
  return (
    <Link
      to="/cart"
      data-cart-target
      aria-label={`Cart${itemCount > 0 ? ` (${itemCount} items)` : ''}`}
      aria-hidden={quiet || undefined}
      tabIndex={quiet ? -1 : undefined}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-cream hover:text-clay ${
        quiet ? 'pointer-events-none opacity-0' : ''
      }`}
    >
      <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
      {itemCount > 0 && (
        <span
          key={itemCount}
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 animate-[cart-badge_240ms_ease-out] items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(182,71,42,0.45)]"
        >
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
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-cream hover:text-clay"
    >
      <Package className="h-[18px] w-[18px]" aria-hidden="true" />
    </Link>
  )
}

function MessagesLink() {
  const { unread } = useChat()
  return (
    <Link
      to="/chat"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-cream hover:text-clay"
    >
      <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span
          key={unread}
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 animate-[cart-badge_240ms_ease-out] items-center justify-center rounded-full bg-clay px-1 text-[10px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(182,71,42,0.45)]"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}

function MenuLink({ to, icon: Icon, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-ink transition hover:bg-cream/70 hover:text-clay"
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
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-cream"
        >
          <span className="rounded-full bg-gradient-to-br from-clay via-gold to-clay p-[1.5px] shadow-[0_4px_12px_-4px_rgba(182,71,42,0.55)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-noir text-[12px] font-semibold text-cream">
              {initials(user.name)}
            </span>
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
            {user.role === 'CUSTOMER' && (
              <>
                <MenuLink to="/orders" icon={Package} onClick={close}>
                  My orders
                </MenuLink>
                <MenuLink to="/bookings" icon={CalendarCheck} onClick={close}>
                  My bookings
                </MenuLink>
              </>
            )}
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
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-clay transition hover:bg-canvas"
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
      className="block rounded-card px-3 py-2.5 text-[14px] font-medium text-ink transition hover:bg-cream hover:text-clay"
    >
      {children}
    </NavLink>
  )
}

// Bell / orders / cart as tiles inside the drawer (small screens only reach them here).
function QuickAccess() {
  const { user } = useAuth()
  const { itemCount } = useCart()
  const { unreadCount } = useNotifications()
  const { unread: unreadChats } = useChat()
  const isCustomer = user?.role === 'CUSTOMER'

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Quick access</p>
      <div className={`grid gap-2.5 ${isCustomer ? 'grid-cols-4' : 'grid-cols-1'}`}>
        <DrawerTile to="/notifications" icon={Bell} label="Alerts" badge={unreadCount} />
        {isCustomer && <DrawerTile to="/chat" icon={MessageCircle} label="Chat" badge={unreadChats} />}
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
      className="relative flex flex-col items-center gap-1.5 rounded-card border border-line-warm bg-paper-warm px-2 py-3 text-ink shadow-[0_8px_20px_-16px_rgba(21,20,15,0.4)] transition hover:-translate-y-0.5 hover:border-clay/40 hover:text-clay"
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
  const { itemCount } = useCart()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const scrolled = useScrolled()
  const isStaff = user && user.role !== 'CUSTOMER'

  return (
    <header className="sticky top-0 z-40">
      <Highlights />
      <div
        className={`relative border-b transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled
            ? 'glass border-line-warm/70 shadow-[0_18px_40px_-30px_rgba(21,20,15,0.6)]'
            : 'border-line-warm/60 bg-paper-warm/85 backdrop-blur-md'
        }`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-clay/30 to-transparent"
        />
        <div
          className={`mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 transition-[height] duration-300 ${
            scrolled ? 'h-14' : 'h-[68px]'
          }`}
        >
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-ink transition hover:bg-cream lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link
            to="/"
            className="group inline-flex items-baseline text-[22px] font-semibold tracking-tight text-ink"
            aria-label="CityCart home"
          >
            <span className="transition-transform duration-300 ease-out group-hover:-translate-y-0.5">CityCart</span>
            <span className="text-clay transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-125 group-hover:drop-shadow-[0_0_7px_rgba(184,71,42,0.55)]">
              .
            </span>
          </Link>
        </div>

        {/* Centred between the two side clusters; drops to the drawer below lg */}
        <nav
          aria-label="Main"
          className="hidden items-center gap-0.5 rounded-full border border-line-warm/80 bg-cream/50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_18px_-16px_rgba(21,20,15,0.45)] backdrop-blur-md lg:flex"
        >
          {NAV.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
        </nav>

        <div className="flex items-center justify-end gap-1.5">
          <SearchForm className="hidden w-44 transition-[width] duration-300 focus-within:w-60 lg:block" />
          <span className="mx-1 hidden h-5 w-px bg-line-warm lg:block" aria-hidden="true" />
          {/* On small screens these three live inside the menu drawer instead. */}
          <div className="hidden items-center gap-0.5 lg:flex">
            <NotificationBell />
            {user?.role === 'CUSTOMER' && (
              <>
                <MessagesLink />
                <OrdersLink />
                <CartLink />
              </>
            )}
          </div>
          {/* The bag stays reachable on phones once there is something in it —
              it is also the target the product page's photo flies into. While
              the cart is empty it keeps its box (so the flight can measure it)
              but is invisible. */}
          {user?.role === 'CUSTOMER' && (
            <div className="lg:hidden">
              <CartLink quiet={itemCount === 0} />
            </div>
          )}

          {user ? (
            // On small screens the account lives inside the menu drawer instead.
            <div className="hidden lg:block">
              <AccountMenu user={user} logout={logout} />
            </div>
          ) : (
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
              <Link
                to="/login"
                className="whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-medium text-ink transition hover:bg-cream"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="shine ml-1 inline-flex h-9 items-center whitespace-nowrap rounded-full bg-gradient-to-br from-noir to-forest-deep px-4 text-[12.5px] font-medium tracking-wide text-white shadow-[0_8px_20px_-10px_rgba(21,20,15,0.7)] transition hover:from-forest-deep hover:to-noir"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
        </div>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu">
        <div className="space-y-5">
          <SearchForm autoFocus onSubmitted={() => setDrawerOpen(false)} />
          {user && <QuickAccess />}

          <nav aria-label="Mobile" className="space-y-1 border-t border-line pt-4">
            <DrawerLink to="/" onClick={() => setDrawerOpen(false)}>
              Home
            </DrawerLink>
            <DrawerLink to="/nearby" onClick={() => setDrawerOpen(false)}>
              Stores
            </DrawerLink>
            <DrawerLink to="/services" onClick={() => setDrawerOpen(false)}>
              Services
            </DrawerLink>
            {user?.role === 'CUSTOMER' && (
              <DrawerLink to="/orders" onClick={() => setDrawerOpen(false)}>
                My orders
              </DrawerLink>
            )}
            {user?.role === 'CUSTOMER' && (
              <DrawerLink to="/bookings" onClick={() => setDrawerOpen(false)}>
                My bookings
              </DrawerLink>
            )}
            {user?.role === 'CUSTOMER' && (
              <DrawerLink to="/addresses" onClick={() => setDrawerOpen(false)}>
                Saved addresses
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
                  <span className="rounded-full bg-gradient-to-br from-clay via-gold to-clay p-[1.5px]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-noir text-[13px] font-semibold text-cream">
                      {initials(user.name)}
                    </span>
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
                  className="flex w-full items-center gap-2 rounded-md border border-line px-4 py-2.5 text-[13px] font-medium text-clay transition hover:bg-canvas"
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
                  className="flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-br from-noir to-forest-deep text-[13px] font-medium uppercase tracking-[0.08em] text-white shadow-[0_10px_24px_-12px_rgba(21,20,15,0.8)] transition hover:brightness-110"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-11 w-full items-center justify-center rounded-full border border-ink/20 text-[13px] font-medium uppercase tracking-[0.08em] text-ink transition hover:border-clay hover:text-clay"
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
