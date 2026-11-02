import { Pressable, View } from 'react-native'
import AppText from './ui/AppText'
import StatusPill from './StatusPill'
import { addressLine, cashSummary } from '../utils/delivery'
import { formatPrice, timeAgo } from '../utils/format'
import { colors, radius, spacing } from '../theme'

// One delivery in the list: which order, where to, how much cash to collect.
export default function DeliveryCard({ delivery, onPress }) {
  const cash = cashSummary(delivery)
  const where = addressLine(delivery.address)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${delivery.orderNumber}, ${delivery.status}${where ? `, ${where}` : ''}`}
      style={({ pressed }) => ({ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface, gap: spacing.sm })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="strong">{delivery.orderNumber || 'Order'}</AppText>
        <StatusPill value={delivery.status} />
      </View>
      {delivery.address ? (
        <View>
          <AppText variant="label">{delivery.address.name}</AppText>
          <AppText variant="small" numberOfLines={2}>
            {where}
          </AppText>
        </View>
      ) : (
        <AppText variant="small">Delivery closed</AppText>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {cash.kind === 'collect' ? (
          <AppText variant="strong" style={{ color: colors.pine }}>
            Collect {formatPrice(cash.amount)}
          </AppText>
        ) : (
          <AppText variant="small">
            {cash.kind === 'collected' ? 'Cash collected' : cash.kind === 'proof' ? 'Paid at the door' : 'Paid online'}
          </AppText>
        )}
        <AppText variant="small">{timeAgo(delivery.assignedAt || delivery.updatedAt)}</AppText>
      </View>
    </Pressable>
  )
}
