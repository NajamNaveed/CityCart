import { useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchNotifications, markNotificationRead } from '../../services/notifications'
import { timeAgo } from '../../utils/format'
import { colors, radius, spacing } from '../../theme'

// The rider's inbox: mostly "you have a new delivery". Opening one marks it read
// and goes to that delivery.
export default function Alerts() {
  const router = useRouter()
  const list = usePagedList('rider-alerts', (page) => fetchNotifications(page))
  const [readHere, setReadHere] = useState({})

  const refreshRef = useRef(list.refresh)
  useEffect(() => {
    refreshRef.current = list.refresh
  })
  useFocusEffect(() => {
    refreshRef.current()
  })

  async function open(notification) {
    if (!notification.isRead) {
      setReadHere((prev) => ({ ...prev, [notification._id]: true }))
      try {
        await markNotificationRead(notification._id)
      } catch {
        // Marking it read failed; still go where it points.
      }
    }
    const deliveryId = notification.data?.deliveryId
    if (deliveryId) router.push(`/delivery/${deliveryId}`)
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          Alerts
        </AppText>
      </View>
      <FlatList
        data={list.items}
        keyExtractor={(n) => n._id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={80} />
              ))}
            </View>
          ) : list.error ? (
            <EmptyState icon="wifi-off" tone="error" title="Couldn't load your alerts" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
          ) : (
            <EmptyState icon="bell" title="No alerts" message="You will see new deliveries here." />
          )
        }
        renderItem={({ item }) => {
          const unread = !item.isRead && !readHere[item._id]
          return (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${unread ? 'Unread. ' : ''}${item.message}`}
              style={({ pressed }) => ({ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: unread ? colors.pine : colors.line, backgroundColor: pressed ? colors.sand : colors.surface, gap: 2 })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
                  {item.title}
                </AppText>
                {unread ? <View accessibilityLabel="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pine }} /> : null}
                <AppText variant="small" style={{ fontSize: 12 }}>
                  {timeAgo(item.createdAt)}
                </AppText>
              </View>
              <AppText variant="small" numberOfLines={2}>
                {item.message}
              </AppText>
            </Pressable>
          )
        }}
      />
    </SafeAreaView>
  )
}
