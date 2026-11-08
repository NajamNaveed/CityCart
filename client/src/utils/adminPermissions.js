// Mirrors the server's admin areas (server/src/config/adminPermissions.js).
// The server enforces every one of these on each request; the admin dashboard
// uses them only to show a partner what they may open.
export const ADMIN_PERMISSIONS = {
  BRANDS: 'admin.brands',
  USERS: 'admin.users',
  ORDERS: 'admin.orders',
  REVIEWS: 'admin.reviews',
  LOCATIONS: 'admin.locations',
  CATALOG: 'admin.catalog',
  SETTINGS: 'admin.settings',
  ANALYTICS: 'admin.analytics',
  PAYMENTS: 'admin.payments',
}

export const ADMIN_PERMISSION_OPTIONS = [
  { key: ADMIN_PERMISSIONS.BRANDS, label: 'Brands', hint: 'Review applications, suspend and terminate brands' },
  { key: ADMIN_PERMISSIONS.ORDERS, label: 'Orders', hint: 'See and manage orders across the platform' },
  { key: ADMIN_PERMISSIONS.USERS, label: 'Users', hint: 'Browse the customer and brand-staff directory' },
  { key: ADMIN_PERMISSIONS.REVIEWS, label: 'Reviews', hint: 'Moderate customer reviews' },
  { key: ADMIN_PERMISSIONS.LOCATIONS, label: 'Cities and areas', hint: 'Add and manage cities and delivery areas' },
  { key: ADMIN_PERMISSIONS.CATALOG, label: 'Catalogue', hint: 'Manage the global categories and the shared product catalogue' },
  { key: ADMIN_PERMISSIONS.ANALYTICS, label: 'Analytics', hint: 'See platform-wide analytics' },
  { key: ADMIN_PERMISSIONS.SETTINGS, label: 'Settings', hint: 'Change platform commission and settings' },
  { key: ADMIN_PERMISSIONS.PAYMENTS, label: 'Payments', hint: 'See payment records and receipts across the platform' },
]

export const ALL_ADMIN_PERMISSIONS = ADMIN_PERMISSION_OPTIONS.map((item) => item.key)

// Quick starting points for the Add partner form. A preset only fills the
// ticks; the super admin can change anything afterwards.
export const ADMIN_PRESETS = [
  { key: 'FULL', label: 'Full partner', permissions: ALL_ADMIN_PERMISSIONS, readOnly: false },
  { key: 'READ_ONLY', label: 'Read only', permissions: ALL_ADMIN_PERMISSIONS, readOnly: true },
]

/** True when the account may open `area` (the super admin may open all). */
export function adminCan(user, area) {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (user.role !== 'ADMIN_PARTNER') return false
  return Array.isArray(user.permissions) && user.permissions.includes(area)
}

export function isReadOnlyAdmin(user) {
  return Boolean(user && user.role === 'ADMIN_PARTNER' && user.readOnly)
}

// The sidebar entries an account may open:
// [path, label, end-exact, icon, areas, super-only, match-any, group].
// Kept here rather than in AdminLayout so fast refresh sees a
// components-only module (nav needs the same areas the server enforces).
export const ADMIN_NAV = [
  ['/admin', 'Overview', true, 'LayoutDashboard', [ADMIN_PERMISSIONS.BRANDS, ADMIN_PERMISSIONS.ORDERS], false, true, 'Overview'],
  ['/admin/brands', 'Brands', false, 'Store', [ADMIN_PERMISSIONS.BRANDS], false, false, 'Sellers'],
  ['/admin/providers', 'Providers', false, 'BadgeCheck', [], true, false, 'Sellers'],
  ['/admin/orders', 'Orders', false, 'Package', [ADMIN_PERMISSIONS.ORDERS], false, false, 'Orders'],
  ['/admin/service-bookings', 'Service bookings', false, 'CalendarClock', [ADMIN_PERMISSIONS.ORDERS], false, false, 'Orders'],
  ['/admin/returns', 'Returns', false, 'Undo2', [ADMIN_PERMISSIONS.ORDERS], false, false, 'Orders'],
  ['/admin/reviews', 'Reviews', false, 'Star', [ADMIN_PERMISSIONS.REVIEWS], false, false, 'Reviews'],
  ['/admin/service-reviews', 'Service reviews', false, 'MessageCircle', [ADMIN_PERMISSIONS.REVIEWS], false, false, 'Reviews'],
  ['/admin/categories', 'Product categories', false, 'Tags', [ADMIN_PERMISSIONS.CATALOG], false, false, 'Catalogue'],
  ['/admin/service-categories', 'Service categories', false, 'LayoutGrid', [ADMIN_PERMISSIONS.CATALOG], false, false, 'Catalogue'],
  ['/admin/catalogue', 'Catalogue', false, 'LibraryBig', [ADMIN_PERMISSIONS.CATALOG], false, false, 'Catalogue'],
  ['/admin/cities', 'Cities', false, 'MapPin', [ADMIN_PERMISSIONS.LOCATIONS], false, false, 'Locations'],
  ['/admin/blocks', 'Blocks and areas', false, 'MapPinned', [ADMIN_PERMISSIONS.LOCATIONS], false, false, 'Locations'],
  ['/admin/users', 'Users', false, 'UsersRound', [ADMIN_PERMISSIONS.USERS], false, false, 'People'],
  ['/admin/team', 'Admin team', false, 'UserCog', [], true, false, 'People'],
  ['/admin/billing', 'Billing', false, 'ReceiptText', [], true, false, 'Money'],
  ['/admin/analytics', 'Analytics', false, 'ChartLine', [ADMIN_PERMISSIONS.ANALYTICS], false, false, 'Platform'],
  ['/admin/settings', 'Settings', false, 'Settings', [ADMIN_PERMISSIONS.SETTINGS], false, false, 'Platform'],
  ['/admin/activity', 'Activity', false, 'History', [], true, false, 'Platform'],
]

function visibleNav(user) {
  if (!user) return []
  if (user.role === 'SUPER_ADMIN') return ADMIN_NAV
  return ADMIN_NAV.filter(([, , , , areas, superOnly, matchAny]) => {
    if (superOnly) return false
    if (areas.length === 0) return true
    return matchAny ? areas.some((area) => adminCan(user, area)) : areas.every((area) => adminCan(user, area))
  })
}

export function adminNavFor(user) {
  return visibleNav(user)
}

// Same entries, grouped for the sidebar: [{ label, items: [...] }].
export function adminNavGroupsFor(user) {
  const groups = []
  visibleNav(user).forEach((entry) => {
    const group = entry[7]
    let target = groups.find((item) => item.label === group)
    if (!target) {
      target = { label: group, items: [] }
      groups.push(target)
    }
    target.items.push(entry)
  })
  return groups
}
