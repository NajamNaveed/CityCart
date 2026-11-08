// Where a notification click should land, per role and payload. Store and
// service notifications carry different ids, so one mapper keeps the bell
// dropdown and the full inbox in step.
const isAdmin = (role) => role === 'SUPER_ADMIN' || role === 'ADMIN_PARTNER'

export function notificationTarget(notification, user) {
  if (!user) return null
  const data = notification?.data || {}
  const type = notification?.type || ''
  const role = user.role

  if (data.orderId) {
    if (role === 'CUSTOMER') return `/orders/${data.orderId}`
    if (isAdmin(role)) return `/admin/orders/${data.orderId}`
    return `/brand/orders/${data.orderId}`
  }

  if (data.bookingId) {
    if (role === 'SERVICE_PROVIDER') {
      return type === 'NEW_REVIEW' ? '/provider/reviews' : `/provider/bookings/${data.bookingId}`
    }
    if (role === 'CUSTOMER') return `/bookings/${data.bookingId}`
    if (isAdmin(role)) return '/admin/service-bookings'
    return null
  }

  if (type.startsWith('BILLING_')) {
    if (role === 'SERVICE_PROVIDER') return '/provider/billing'
    if (isAdmin(role)) return '/admin/billing'
    return '/brand/billing'
  }

  if (data.brandId) {
    if (isAdmin(role)) return `/admin/brands/${data.brandId}`
    return '/brand'
  }

  if (data.providerId) {
    if (role === 'SERVICE_PROVIDER') return type === 'NEW_REVIEW' ? '/provider/reviews' : '/provider'
    if (role === 'SUPER_ADMIN') return `/admin/providers/${data.providerId}`
    if (role === 'ADMIN_PARTNER') return '/admin/service-bookings'
    if (role === 'CUSTOMER') return '/services'
  }

  if (data.productId) {
    return role === 'CUSTOMER' ? `/product/${data.productId}` : '/brand/reviews'
  }

  return null
}
