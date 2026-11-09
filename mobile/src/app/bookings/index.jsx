import { useState } from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import BackButton from '../../components/BackButton'
import ListFooter from '../../components/ListFooter'
import ProductImage from '../../components/ProductImage'
import RequireCustomer from '../../components/RequireCustomer'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { usePagedList } from '../../hooks/usePagedList'
import { fetchBookings, bookingWhen, priceOf, STATUS_NOTES } from '../../services/bookings'
import { formatPrice } from '../../utils/format'
import { formatKarachiDateTime } from '../../utils/serviceSlots'
import { colors, radius, spacing } from '../../theme'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'PROPOSED', label: 'Price ready' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'DISPUTED', label: 'Disputed' },
]

function BookingRow({ booking, onPress }) {
  const note = STATUS_NOTES[booking.status]
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.offering?.title}, ${booking.status}, ${formatPrice(priceOf(booking) / 100)}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.sand : colors.surface,
      })}
    >
      <ProductImage
        src={booking.offering?.image}
        name={booking.offering?.title}
        width={56}
        style={{ width: 56, height: 56, borderRadius: radius.sm }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="strong" numberOfLines={1} style={{ flex: 1 }}>
            {booking.offering?.title || 'Service'}
          </AppText>
          <StatusPill value={booking.status} />
        </View>
        <AppText variant="small" numberOfLines={1}>
          {booking.provider?.displayName || 'Service provider'} · {booking.bookingNumber}
        </AppText>
        <AppText variant="small" style={{ fontSize: 12 }}>
          {formatKarachiDateTime(bookingWhen(booking))}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xs }}>
          <AppText variant="strong">{formatPrice(priceOf(booking) / 100)}</AppText>
          {note ? (
            <AppText variant="small" style={{ color: colors.clay, fontSize: 12 }}>
              {note}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

function BookingsList({ userId }) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const list = usePagedList(`bookings:${userId}:${status}`, (page) => fetchBookings(page, status))

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm }}
      >
        {FILTERS.map((filter) => {
          const selected = filter.value === status
          return (
            <Pressable
              key={filter.value || 'all'}
              onPress={() => setStatus(filter.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Filter ${filter.label}`}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                minHeight: 36,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.ink : colors.line,
                backgroundColor: selected ? colors.ink : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="label" style={{ color: selected ? colors.white : colors.ink, fontSize: 13 }}>
                {filter.label}
              </AppText>
            </Pressable>
          )
        })}
      </ScrollView>

      <FlatList
        data={list.items}
        keyExtractor={(booking) => booking._id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshing={list.refreshing}
        onRefresh={list.refresh}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          list.loading ? (
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={104} />
              ))}
            </View>
          ) : list.error ? (
            <EmptyState
              icon="wifi-off"
              tone="error"
              title="Couldn't load your bookings"
              message={list.error}
              action={<Button title="Try again" onPress={list.refresh} />}
            />
          ) : status ? (
            <EmptyState
              icon="calendar"
              title="No bookings with that status"
              message="Try another filter, or request a new time."
              action={<Button title="Browse services" onPress={() => router.navigate('/services')} />}
            />
          ) : (
            <EmptyState
              icon="calendar"
              title="No bookings yet"
              message="Browse services near you and request a time. You pay the provider at the door."
              action={<Button title="Browse services" onPress={() => router.navigate('/services')} />}
            />
          )
        }
        renderItem={({ item: booking }) => (
          <BookingRow booking={booking} onPress={() => router.push(`/bookings/${booking._id}`)} />
        )}
        ListFooterComponent={<ListFooter list={list} />}
      />
    </View>
  )
}

export default function Bookings() {
  const { user } = useAuth()
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          My bookings
        </AppText>
      </View>
      <RequireCustomer
        next="/bookings"
        icon="calendar"
        title="Sign in to see your bookings"
        message="The service times you request are kept in your account."
      >
        <BookingsList userId={user?.id} />
      </RequireCustomer>
    </SafeAreaView>
  )
}
