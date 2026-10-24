// What a brand team member may see in the app. The permission list comes from
// the server (`GET /auth/me`); the server checks the same permission on every
// request, so hiding a tab is a convenience and never the security.
export const can = (user, permission) => Array.isArray(user?.permissions) && user.permissions.includes(permission)

// Which records tabs this person gets. `home` is shown to anyone who has at least
// one of the others; the profile is for everyone.
export function visibleTabs(user) {
  const orders = can(user, 'orders.view')
  const shipments = can(user, 'delivery.view')
  const money = can(user, 'payments.view')
  return { overview: orders || shipments || money, orders, shipments, money }
}

export const hasNoAccess = (user) => !Object.values(visibleTabs(user)).some(Boolean)
