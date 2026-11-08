import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ChevronDown, ExternalLink, LogOut, Menu as MenuIcon } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useChat } from '../../hooks/useChat'
import NotificationBell from '../NotificationBell'
import Drawer from '../ui/Drawer'
import Menu from '../ui/Menu'

const KIND_LABEL = {
  brand: 'Brand dashboard',
  provider: 'Provider dashboard',
  admin: 'Platform admin',
}

const ROLE_LABEL = {
  BRAND_ADMIN: 'Brand owner',
  BRAND_EMPLOYEE: 'Team member',
  SERVICE_PROVIDER: 'Service provider',
  SUPER_ADMIN: 'Super admin',
  ADMIN_PARTNER: 'Admin partner',
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function navLinkClass(activeTone) {
  return ({ isActive }) =>
    `group flex items-center gap-2.5 rounded-tile px-3 py-2 text-[13px] font-medium transition-colors ${
      isActive
        ? `${activeTone} shadow-sm shadow-noir/10`
        : 'text-ink/65 hover:bg-sand/70 hover:text-ink'
    }`
}

function SidebarNav({ nav, tone, onNavigate }) {
  return (
    <nav aria-label="Dashboard sections" className="space-y-6">
      {nav.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink/40">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map(({ to, label, end, icon: Icon, badge }) => (
              <NavLink key={to} to={to} end={end} className={navLinkClass(tone)} onClick={onNavigate}>
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition-colors ${
                        isActive ? 'bg-white/12 text-current' : 'bg-sand/80 text-ink/50 group-hover:text-ink/70'
                      }`}
                    >
                      <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
                    </span>
                    <span className="truncate">{label}</span>
                    {badge > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[10px] font-semibold text-white">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function UserMenu({ user, roleLabel, actions = [], logout }) {
  return (
    <Menu
      width="w-64"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="true"
          className="flex items-center gap-2 rounded-full border border-line-warm bg-paper-warm py-1 pl-1 pr-2 transition hover:border-ink/25 sm:rounded-tile"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest text-[11px] font-semibold text-cream">
            {initials(user.name)}
          </span>
          <span className="hidden max-w-32 truncate text-[12.5px] font-medium text-ink sm:block">{user.name}</span>
          <ChevronDown
            className={`hidden h-3.5 w-3.5 text-ink/40 transition-transform sm:block ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    >
      {({ close }) => (
        <div className="py-1.5">
          <div className="border-b border-line-warm px-3.5 pb-2.5 pt-1">
            <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
            <span className="block truncate text-[11.5px] text-muted">{user.email}</span>
            <span className="mt-1.5 inline-flex rounded-full bg-sand px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink/55">
              {roleLabel}
            </span>
          </div>
          <div className="pt-1">
            {actions.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={close}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-ink/75 transition hover:bg-cream/70 hover:text-ink"
              >
                <Icon className="h-4 w-4 text-ink/45" aria-hidden="true" />
                {label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                close()
                logout()
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-clay transition hover:bg-clay/5"
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

/**
 * One warm shell for the brand, provider and platform dashboards: sticky
 * header, grouped sidebar, mobile drawer, skip link and a shared account menu.
 * Pages only supply their nav groups and page content.
 */
export default function DashboardLayout({
  kind,
  home,
  nav,
  shopTo = '/',
  shopLabel = 'View shop',
  note,
  banners,
  maxWidth = 'max-w-[1200px]',
  children,
}) {
  const { user, logout } = useAuth()
  const { unread } = useChat()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const groups = nav.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.to.endsWith('/messages') && unread > 0 ? { ...item, badge: unread } : item,
    ),
  }))

  const activeTone = kind === 'admin' ? 'bg-noir text-cream' : 'bg-forest text-cream'
  const roleLabel = ROLE_LABEL[user?.role] || 'Team member'
  const menuActions = [{ to: shopTo, label: shopLabel, icon: ExternalLink }]

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-tile focus:bg-noir focus:px-4 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-cream"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-line-warm bg-paper-warm/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-tile text-ink/70 transition hover:bg-sand/70 hover:text-ink lg:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>

          <Link to={home} className="flex shrink-0 items-baseline gap-2">
            <span className="text-[20px] font-semibold tracking-tight text-ink">
              CityCart<span className="text-clay">.</span>
            </span>
            <span className="hidden text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink/40 sm:inline">
              {KIND_LABEL[kind]}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to={shopTo}
              className="hidden items-center gap-1.5 rounded-tile px-3 py-2 text-[12.5px] font-medium text-ink/60 transition hover:bg-sand/60 hover:text-ink md:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {shopLabel}
            </Link>
            <NotificationBell />
            <UserMenu user={user} roleLabel={roleLabel} actions={menuActions} logout={logout} />
          </div>
        </div>
      </header>

      {banners}

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[252px] shrink-0 overflow-y-auto overscroll-contain border-r border-line-warm bg-paper-warm/55 px-4 py-6 lg:block">
          <SidebarNav nav={groups} tone={activeTone} />
          {note && (
            <div className="mt-7 rounded-card border border-line-warm bg-cream/60 p-3.5">
              <p className="text-[11.5px] leading-relaxed text-ink/60">{note}</p>
            </div>
          )}
        </aside>

        <main
          id="dashboard-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
        >
          <div className={`mx-auto w-full ${maxWidth}`}>{children ?? <Outlet />}</div>
        </main>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={KIND_LABEL[kind]}>
        <SidebarNav nav={groups} tone={activeTone} onNavigate={() => setDrawerOpen(false)} />
        {note && <p className="mt-6 rounded-card border border-line-warm bg-cream/60 p-3.5 text-[11.5px] leading-relaxed text-ink/60">{note}</p>}
        <div className="mt-6 border-t border-line-warm pt-4">
          <Link
            to={shopTo}
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-2.5 rounded-tile px-3 py-2.5 text-[13px] font-medium text-ink/65 transition hover:bg-sand/70 hover:text-ink"
          >
            <ExternalLink className="h-4 w-4 text-ink/45" aria-hidden="true" />
            {shopLabel}
          </Link>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false)
              logout()
            }}
            className="flex w-full items-center gap-2.5 rounded-tile px-3 py-2.5 text-left text-[13px] font-medium text-clay transition hover:bg-clay/5"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </Drawer>
    </div>
  )
}
