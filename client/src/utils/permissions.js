// Mirrors the server's permission names (server/src/config/permissions.js).
// Brand owners and the super admin have full access; a team member has only
// the permissions the owner granted. The server enforces this on every request;
// the dashboard only uses it to hide what a person cannot use.
export function can(user, permission) {
  if (!user) return false
  if (user.role === 'SUPER_ADMIN' || user.role === 'BRAND_ADMIN') return true
  if (user.role === 'BRAND_EMPLOYEE') return Array.isArray(user.permissions) && user.permissions.includes(permission)
  return false
}

// How permissions are grouped and worded on the Team page.
export const PERMISSION_GROUPS = [
  {
    title: 'Products',
    items: [
      ['products.view', 'See products'],
      ['products.create', 'Add products'],
      ['products.update', 'Edit products'],
      ['products.delete', 'Archive products'],
    ],
  },
  {
    title: 'Categories',
    items: [
      ['categories.view', 'See categories'],
      ['categories.create', 'Add categories'],
      ['categories.update', 'Rename categories'],
      ['categories.delete', 'Remove categories'],
    ],
  },
  {
    title: 'Stock',
    items: [
      ['inventory.view', 'See stock levels'],
      ['inventory.manage', 'Change stock levels'],
    ],
  },
  {
    title: 'Orders',
    items: [
      ['orders.view', 'See orders'],
      ['orders.manage', 'Confirm, process and reject orders'],
    ],
  },
  {
    title: 'Analytics',
    items: [['analytics.view', 'View brand analytics']],
  },
  {
    title: 'Deliveries',
    items: [
      ['delivery.view', 'See deliveries'],
      ['delivery.manage', 'Update delivery progress'],
    ],
  },
  {
    title: 'Team',
    items: [
      ['employees.view', 'See the team'],
      ['employees.create', 'Add team members'],
      ['employees.update', 'Edit and reactivate team members'],
      ['employees.delete', 'Deactivate team members'],
      ['employees.manage_permissions', 'Change what team members can do'],
    ],
  },
]

// Quick starting points; the owner can still tick or untick anything afterwards.
export const PRESETS = [
  ['Order handler', ['orders.view', 'orders.manage', 'delivery.view', 'delivery.manage']],
  [
    'Catalogue manager',
    ['products.view', 'products.create', 'products.update', 'categories.view', 'categories.create', 'categories.update', 'inventory.view', 'inventory.manage'],
  ],
  ['View only', ['products.view', 'categories.view', 'inventory.view', 'orders.view', 'delivery.view']],
]