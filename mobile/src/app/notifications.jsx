import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../components/ui/AppText'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import BackButton from '../components/BackButton'
import RequireCustomer from '../components/RequireCustomer'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import { usePagedList } from '../hooks/usePagedList'
import { fetchNotifications } from '../services/notifications'
import { timeAgo } from '../utils/format'
import { colors, radius, spacing } from '../theme'

// The same grouping as the web inbox: delivery, order, review, stock, else update.
function visualsFor(type = '') {
  if (type.includes('DELIVER') || type === 'ORDER_SHIPPED' || type === 'ORDER_OUT_FOR_DELIVERY') return { icon: 'truck', color: colors.success, bg: colors.successSoft, label: 'Delivery' }
  if (type.includes('ORDER') || type.includes('PAYMENT') || type.includes('REFUND') || type.includes('ADJUSTMENT')) return { icon: 'package', color: colors.warning, bg: colors.warningSoft, label: 'Order' }
  if (type.includes('REVIEW')) return { icon: 'star', color: colors.clay, bg: colors.cream, label: 'Review' }
  if (type.includes('STOCK')) return { icon: 'alert-circle', color: colors.danger, bg: colors.dangerSoft, label: 'Inventory' }
  return { icon: 'bell', color: colors.info, bg: colors.infoSoft, label: 'Update' }
}

function NotificationRow({ notification, busy, onPress, onDelete }) {
  const look = visualsFor(notification.type)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.isRead ? '' : 'Unread. '}${notification.message}`}
      style={({ pressed }) => ({ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: notification.isRead ? colors.line : colors.clay, backgroundColor: pressed ? colors.sand : colors.surface })}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={look.icon} size={18} color={look.color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
            {notification.title}
          </AppText>
          {!notification.isRead ? <View accessibilityLabel="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.clay }} /> : null}
          <AppText variant="small" style={{ fontSize: 12 }}>
            {timeAgo(notification.createdAt)}
          </AppText>
        </View>
        <AppText variant="small" numberOfLines={2}>
          {notification.message}
        </AppText>
      </View>
      <Pressable
        onPress={onDelete}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${notification.title}`}
        hitSlop={8}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.4 : 1 }}
      >
        <Feather name="trash-2" size={17} color={colors.muted} />
      </Pressable>
    </Pressable>
  )
}

function NotificationsInbox({ userId }) {
  const router = useRouter()
  const { markRead, markAllRead, remove } = useNotifications()
  const list = usePagedList(`notifications:${userId}`, (page) => fetchNotifications(page))
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  // The paged list owns its rows; read/done state set from here overlays it
  // until the next fetch brings the server's own truth.
  const [readHere, setReadHere] = useState({})
  const [cleared, setCleared] = useState(false)
  // One subscription for the screen's lifetime; the latest refresh is picked
  // up in an effect, so a new render never re-subscribes.
  const refreshRef = useRef(list.refresh)
  useEffect(() => {
    refreshRef.current = list.refresh
  })

  // A push may arrive while the inbox is open; the badge already moved, the list catches up.
  const { subscribeChat: subscribe } = useNotifications()
  useEffect(() => subscribe((type) => type === 'message' && refreshRef.current()), [subscribe])

  const items = useMemo(() => {
    const withRead = list.items.map((n) => (cleared || readHere[n._id] ? { ...n, isRead: true } : n))
    return filter === 'unread' ? withRead.filter((n) => !n.isRead) : withRead
  }, [filter, list.items, readHere, cleared])
  const unreadLoaded = items.filter((n) => !n.isRead).length

  async function open(notification) {
    const orderId = notification.data?.orderId
    try {
      if (!notification.isRead) {
        setBusyId(notification._id)
        await markRead(notification._id)
        setReadHere((prev) => ({ ...prev, [notification._id]: true }))
      }
    } catch {
      // Reading it failed; still go where it points.
    } finally {
      setBusyId(null)
    }
    if (orderId) router.push(`/orders/${orderId}`)
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        {[
          ['all', 'All'],
          ['unread', unreadLoaded > 0 ? `Unread (${unreadLoaded})` : 'Unread'],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
            style={{ minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: filter === value ? colors.ink : colors.line, backgroundColor: filter === value ? colors.ink : colors.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText variant="label" style={{ color: filter === value ? colors.white : colors.ink, fontSize: 13 }}>
              {label}
            </AppText>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        {unreadLoaded > 0 ? (
          <Pressable
            onPress={() => {
              markAllRead()
                .then(() => {
                  setCleared(true)
                  refreshRef.current()
                })
                .catch(() => {})
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <AppText variant="label" style={{ color: colors.clay }}>
              Mark all read
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(notification) => notification._id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={92} />
              ))}
            </View>
          ) : list.error ? (
            <EmptyState icon="wifi-off" tone="error" title="Couldn't load your notifications" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
          ) : filter === 'unread' ? (
            <EmptyState icon="check-circle" title="You're all caught up" message="No unread notifications right now." />
          ) : (
            <EmptyState icon="bell" title="No notifications yet" message="Order updates and seller replies will appear here." />
          )
        }
        renderItem={({ item: notification }) => (
          <NotificationRow
            notification={notification}
            busy={busyId === notification._id}
            onPress={() => open(notification)}
            onDelete={() => {
              if (busyId) return
              setBusyId(notification._id)
              remove(notification._id, !notification.isRead)
                .then(() => refreshRef.current())
                .catch(() => {})
                .finally(() => setBusyId(null))
            }}
          />
        )}
        ListFooterComponent={
          list.loadingMore ? <ActivityIndicator color={colors.clay} style={{ marginVertical: spacing.lg }} /> : null
        }
      />
    </View>
  )
}

export default function Notifications() {
  const { user } = useAuth()
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Notifications
        </AppText>
      </View>
      <RequireCustomer next="/notifications" icon="bell" title="Sign in to see your notifications" message="Order updates are kept in your account.">
        <NotificationsInbox userId={user?.id} />
      </RequireCustomer>
    </SafeAreaView>
  )
}
