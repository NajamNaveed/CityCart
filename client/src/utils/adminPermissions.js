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
  { key: ADMIN_PERMISSIONS.CATALOG, label: 'Categories', hint: 'Manage the global category tree and the shared product catalogue' },
  { key: ADMIN_PERMISSIONS.ANALYTICS, label: 'Analytics', hint: 'See platform-wide analytics' },
  { key: ADMIN_PERMISSIONS.SETTINGS, label: 'Settings', hint: 'Change platform commission and settings' },
  { key: ADMIN_PERMISSIONS.PAYMENTS, label: 'Payments', hint: 'Review payment events across the platform' },
]

export const ALL_ADMIN_PERMISSIONS = ADMIN_PERMISSION_OPTIONS.map((item) => item.key)

// Quick starting points for the Add partner form. A preset only fills the
// ticks; the super admin can change anything afterwards.
export const ADMIN_PRESETS = [
  { key: 'FULL', label: 'Full partner', permissions: ALL_ADMIN_PERMISSIONS, readOnly: false },
  { key: 'READ_ONLY', label: 'Read only', permissions: ALL_ADMIN_PERMISSIONS, readOnly: true },
]

/** True when the account may open `area` (the super admin may open all). */
function adminCan(user, area) {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN') return true
  if (user.role !== 'ADMIN_PARTNER') return false
  return Array.isArray(user.permissions) && user.permissions.includes(area)
}

export function isReadOnlyAdmin(user) {
  return Boolean(user && user.role === 'ADMIN_PARTNER' && user.readOnly)
}

// The sidebar entries an account may open: [path, label, end, icon, areas].
// Kept here rather than in AdminLayout so fast refresh sees a
// components-only module (nav needs the same areas the server enforces).
export const ADMIN_NAV = [
  ['/admin', 'Overview', true, 'LayoutDashboard', [ADMIN_PERMISSIONS.BRANDS, ADMIN_PERMISSIONS.ORDERS], false],
  ['/admin/brands', 'Brands', false, 'Store', [ADMIN_PERMISSIONS.BRANDS], false],
  ['/admin/orders', 'Orders', false, 'Package', [ADMIN_PERMISSIONS.ORDERS], false],
  ['/admin/reviews', 'Reviews', false, 'Star', [ADMIN_PERMISSIONS.REVIEWS], false],
  ['/admin/cities', 'Cities', false, 'MapPin', [ADMIN_PERMISSIONS.LOCATIONS], false],
  ['/admin/blocks', 'Blocks', false, 'MapPinned', [ADMIN_PERMISSIONS.LOCATIONS], false],
  ['/admin/categories', 'Categories', false, 'Tags', [ADMIN_PERMISSIONS.CATALOG], false],
  ['/admin/analytics', 'Analytics', false, 'ChartLine', [ADMIN_PERMISSIONS.ANALYTICS], false],
  ['/admin/users', 'Users', false, 'UsersRound', [ADMIN_PERMISSIONS.USERS], false],
  ['/admin/settings', 'Settings', false, 'Settings', [ADMIN_PERMISSIONS.SETTINGS], false],
  ['/admin/team', 'Admin team', false, 'UserCog', [], true],
  ['/admin/activity', 'Activity', false, 'History', [], true],
]

export function adminNavFor(user) {
  if (!user) return []
  return ADMIN_NAV.filter(([, , , , areas, superOnly]) => {
    if (user.role === 'SUPER_ADMIN') return true
    return !superOnly && areas.every((area) => adminCan(user, area))
  })
}
