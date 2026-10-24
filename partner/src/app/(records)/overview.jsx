import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import Skeleton from '../../components/ui/Skeleton'
import { useAuth } from '../../hooks/useAuth'
import { useRemote } from '../../hooks/useRemote'
import { fetchOverview, onTheRoad } from '../../services/records'
import { formatPrice } from '../../utils/format'
import { hasNoAccess, visibleTabs } from '../../utils/permissions'
import { colors, radius, spacing } from '../../theme'

function Tile({ label, value, hint, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface, gap: 2 })}
    >
      <AppText variant="small">{label}</AppText>
      <AppText variant="heading" style={{ fontSize: 26, lineHeight: 32 }}>
        {value}
      </AppText>
      {hint ? <AppText variant="small">{hint}</AppText> : null}
    </Pressable>
  )
}

export default function Overview() {
  const router = useRouter()
  const { user } = useAuth()
  const tabs = visibleTabs(user)
  const overview = useRemote('overview', () => fetchOverview({ deliveries: tabs.shipments, money: tabs.money }))
  const goDeliveries = (status) => router.push({ pathname: '/shipments', params: status ? { status } : {} })

  if (hasNoAccess(user)) {
    return (
      <Screen title="Overview">
        <EmptyState icon="lock" title="Nothing to show yet" message="Your brand has not given you access to anything yet. Ask the brand owner to update your permissions." />
      </Screen>
    )
  }

  const { counts, cash } = overview.data || {}
  return (
    <Screen title="Overview" subtitle={user?.name ? `Hello, ${user.name}.` : undefined} refreshing={overview.refreshing} onRefresh={overview.reload}>
      {overview.status === 'loading' ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : overview.status === 'error' ? (
        <EmptyState icon="wifi-off" tone="error" title="Couldn't load the overview" message={overview.error} action={<Button title="Try again" onPress={overview.reload} />} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {counts ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <Tile label="To pick up" value={counts.READY_FOR_PICKUP} onPress={() => goDeliveries('READY_FOR_PICKUP')} />
              <Tile label="On the road" value={onTheRoad(counts)} onPress={() => goDeliveries('OUT_FOR_DELIVERY')} />
              <Tile label="Failed" value={counts.FAILED} hint="Needs another try" onPress={() => goDeliveries('FAILED')} />
              <Tile label="Delivered" value={counts.DELIVERED} hint="All time" onPress={() => goDeliveries('DELIVERED')} />
            </View>
          ) : null}
          {cash ? (
            <Tile
              label="Cash with riders"
              value={formatPrice(cash.total)}
              hint={cash.holders === 0 ? 'Nothing to collect' : `${cash.holders} ${cash.holders === 1 ? 'person' : 'people'} to hand it over`}
              onPress={() => router.push('/money')}
            />
          ) : null}
          {!counts && !cash ? <AppText variant="small">Open Orders to see the orders of your brand.</AppText> : null}
        </View>
      )}
    </Screen>
  )
}
