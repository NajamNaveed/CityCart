import { ActivityIndicator, FlatList, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import BackButton from '../../components/BackButton'
import RequireCustomer from '../../components/RequireCustomer'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchMyOrders } from '../../services/orders'
import { formatDateTime, formatPrice } from '../../utils/format'
import { colors, radius, spacing } from '../../theme'

function OrdersList({ userId }) {
  const router = useRouter()
  const list = usePagedList(`orders:${userId}`, (page) => fetchMyOrders(page))

  return (
    <FlatList
      data={list.items}
      keyExtractor={(order) => order._id}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.6}
      ListEmptyComponent={
        list.loading ? (
          <View style={{ gap: spacing.md }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={110} />
            ))}
          </View>
        ) : list.error ? (
          <EmptyState icon="wifi-off" tone="error" title="Couldn't load your orders" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
        ) : (
          <EmptyState icon="package" title="No orders yet" message="When you place an order, you can follow it here." action={<Button title="Start shopping" onPress={() => router.replace('/shop')} />} />
        )
      }
      renderItem={({ item: order }) => {
        const count = order.items?.length || 0
        return (
          <Pressable
            onPress={() => router.push(`/orders/${order._id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Order ${order.orderNumber}, ${order.orderStatus}, ${formatPrice(order.total)}`}
            style={({ pressed }) => ({ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface, gap: spacing.sm })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
              <AppText variant="strong">{order.orderNumber}</AppText>
              <StatusPill value={order.orderStatus} />
            </View>
            <AppText variant="small">
              {order.brandName || 'Brand'} · {formatDateTime(order.createdAt)}
            </AppText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <AppText variant="small">
                {count} {count === 1 ? 'item' : 'items'}
              </AppText>
              <AppText variant="strong">{formatPrice(order.total)}</AppText>
            </View>
          </Pressable>
        )
      }}
      ListFooterComponent={
        list.loadingMore ? (
          <ActivityIndicator color={colors.clay} style={{ marginVertical: spacing.lg }} />
        ) : list.moreError ? (
          <Pressable onPress={list.loadMore} accessibilityRole="button" style={{ alignItems: 'center', padding: spacing.lg }}>
            <AppText variant="small" style={{ color: colors.danger }}>
              {list.moreError} Tap to try again.
            </AppText>
          </Pressable>
        ) : null
      }
    />
  )
}

export default function Orders() {
  const { user } = useAuth()
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          My orders
        </AppText>
      </View>
      <RequireCustomer next="/orders" icon="package" title="Sign in to see your orders" message="Your orders are saved to your account.">
        <OrdersList userId={user?.id} />
      </RequireCustomer>
    </SafeAreaView>
  )
}
