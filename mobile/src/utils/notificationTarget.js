/**
 * Where a notification tap lands in the shopper app. Store and service events
 * carry different ids, so one mapper keeps every inbox entry consistent with
 * the website's behaviour.
 */
export function notificationTarget(notification, user) {
  if (!user) return null
  const data = notification?.data || {}

  if (data.orderId) return `/orders/${data.orderId}`
  if (data.bookingId) return user.role === 'CUSTOMER' ? `/bookings/${data.bookingId}` : null
  if (data.providerId && user.role === 'CUSTOMER') return '/services'
  if (data.productId && user.role === 'CUSTOMER') return `/product/${data.productId}`
  return null
}
