import api from './api'

/**
 * The shopper's notification inbox (docs/12, /api/v1/notifications). The list
 * answer carries `unreadCount`, so one request feeds both the screen and the
 * badge; there is no separate count endpoint.
 */

export const NOTIFICATIONS_PAGE_SIZE = 20

export async function fetchNotifications(page = 1) {
  const res = await api.get('/notifications', { params: { page, limit: NOTIFICATIONS_PAGE_SIZE } })
  return {
    items: res.data.notifications || [],
    pagination: res.data.pagination,
    meta: { unreadCount: Number(res.data.unreadCount) || 0 },
  }
}

export async function markNotificationRead(id) {
  const res = await api.patch(`/notifications/${id}/read`)
  return res.data.notification
}

export async function markAllNotificationsRead() {
  await api.patch('/notifications/read-all')
}

export async function deleteNotification(id) {
  await api.delete(`/notifications/${id}`)
}
