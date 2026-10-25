import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import DeliveryCard from '../../components/DeliveryCard'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchDeliveries } from '../../services/deliveries'
import { colors, radius, spacing, weights } from '../../theme'

const SCOPES = [
  ['active', 'To do'],
  ['history', 'Finished'],
]
// New assignments show up on their own: the open list checks again every minute.
const REFRESH_EVERY_MS = 60 * 1000

export default function Deliveries() {
  const router = useRouter()
  const [scope, setScope] = useState('active')
  const list = usePagedList(`rider-deliveries:${scope}`, (page) => fetchDeliveries(scope, page))

  // Always call the latest refresh, without re-subscribing on every render.
  const refreshRef = useRef(list.refresh)
  useEffect(() => {
    refreshRef.current = list.refresh
  })
  // The callback MUST be memoized: the navigation library runs it again whenever it
  // changes, so a new function on every render refreshed, re-rendered and looped forever.
  // The first focus is skipped because the list has just loaded itself.
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      // Coming back to the screen (after finishing a delivery) shows the truth.
      refreshRef.current()
    }, []),
  )
  useEffect(() => {
    if (scope !== 'active') return undefined
    const timer = setInterval(() => refreshRef.current(), REFRESH_EVERY_MS)
    return () => clearInterval(timer)
  }, [scope])

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          Deliveries
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          {SCOPES.map(([value, label]) => {
            const selected = scope === value
            return (
              <Pressable
                key={value}
                onPress={() => setScope(value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? colors.pine : colors.line, backgroundColor: selected ? colors.pine : colors.surface }}
              >
                <AppText variant="label" style={{ color: selected ? colors.white : colors.ink, fontWeight: weights.medium }}>
                  {label}
                </AppText>
              </Pressable>
            )
          })}
        </View>
      </View>

      <FlatList
        data={list.items}
        keyExtractor={(delivery) => delivery._id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={120} />
              ))}
            </View>
          ) : list.error ? (
            <EmptyState icon="wifi-off" tone="error" title="Couldn't load your deliveries" message={list.error} action={<Button title="Try again" onPress={list.refresh} />} />
          ) : scope === 'active' ? (
            <EmptyState icon="truck" title="Nothing to deliver" message="When your brand gives you a delivery it appears here. Pull down to check." />
          ) : (
            <EmptyState icon="check-circle" title="No finished deliveries yet" message="Deliveries you complete are listed here." />
          )
        }
        renderItem={({ item }) => <DeliveryCard delivery={item} onPress={() => router.push(`/delivery/${item._id}`)} />}
      />
    </SafeAreaView>
  )
}
