import {
  BadgeCheck,
  CalendarClock,
  ChartLine,
  History,
  LayoutDashboard,
  LayoutGrid,
  LibraryBig,
  MapPin,
  MapPinned,
  MessageCircle,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  Star,
  Store,
  Tags,
  Undo2,
  UserCog,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { adminNavGroupsFor, isReadOnlyAdmin } from '../../utils/adminPermissions'
import DashboardLayout from '../dashboard/DashboardLayout'
import ChangePassword from '../../pages/admin/ChangePassword'

const ICONS = {
  LayoutDashboard,
  Store,
  BadgeCheck,
  Package,
  CalendarClock,
  MessageCircle,
  Star,
  MapPin,
  MapPinned,
  Tags,
  LayoutGrid,
  LibraryBig,
  ChartLine,
  UsersRound,
  Settings,
  UserCog,
  History,
  Undo2,
  ReceiptText,
}

export default function AdminLayout() {
  const { user, logout } = useAuth()

  // A partner's temporary password must be replaced before any other screen
  // opens (docs/21 §G.2). The server refuses everything else until then.
  if (user.mustChangePassword) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <header className="border-b border-line-warm bg-paper-warm">
          <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center px-5 lg:px-8">
            <Link to="/admin" className="flex items-baseline gap-2">
              <span className="text-[20px] font-semibold tracking-tight text-ink">
                CityCart<span className="text-clay">.</span>
              </span>
              <span className="hidden text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink/40 sm:inline">
                Platform admin
              </span>
            </Link>
            <button
              type="button"
              onClick={logout}
              className="ml-auto rounded-tile px-3 py-2 text-[12.5px] font-medium text-ink/60 transition hover:bg-sand/60 hover:text-clay"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="flex flex-1 justify-center px-5 py-12">
          <ChangePassword />
        </main>
      </div>
    )
  }

  const groups = adminNavGroupsFor(user).map((group) => ({
    label: group.label,
    items: group.items.map(([to, label, end, iconName]) => ({
      to,
      label,
      end,
      icon: ICONS[iconName] || LayoutDashboard,
    })),
  }))

  const banners = isReadOnlyAdmin(user) ? (
    <p role="status" className="border-b border-[#e5d2a9] bg-[#f8efd9] px-4 py-2 text-center text-[12.5px] text-[#855811]">
      Read-only access: you can open your areas but cannot change anything. Ask the super admin if you need to make
      changes.
    </p>
  ) : null

  return (
    <DashboardLayout
      kind="admin"
      home="/admin"
      nav={groups}
      shopTo="/"
      shopLabel="Back to marketplace"
      banners={banners}
      maxWidth="max-w-[1320px]"
      note={
        <span className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
          <span>Actions here affect the whole platform. Every change is recorded in Activity.</span>
        </span>
      }
    />
  )
}
