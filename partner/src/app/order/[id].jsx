import { Linking, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import BackButton from '../../components/BackButton'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useRemote } from '../../hooks/useRemote'
import { fetchOrder } from '../../services/records'
import { addressLine, telUrl } from '../../utils/delivery'
import { formatDateTime, formatPrice, humanize } from '../../utils/format'
import { can } from '../../utils/permissions'
import { colors, spacing } from '../../theme'

function Row({ label, value, bold }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant={bold ? 'strong' : 'small'}>{label}</AppText>
      <AppText variant={bold ? 'strong' : 'label'}>{value}</AppText>
    </View>
  )
}

function OrderDetail({ id }) {
  const router = useRouter()
  const { user } = useAuth()
  const remote = useRemote(`order:${id}`, () => fetchOrder(id))
  const { order, payment, delivery } = remote.data || {}

  let body
  if (remote.status === 'loading') {
    body = (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={120} />
        <Skeleton height={160} />
      </View>
    )
  } else if (remote.status === 'error') {
    body = (
      <EmptyState
        icon="alert-circle"
        tone="error"
        title={remote.httpStatus === 404 ? 'Order not found' : "Couldn't load this order"}
        message={remote.error}
        action={remote.httpStatus === 404 ? null : <Button title="Try again" onPress={remote.reload} />}
      />
    )
  } else {
    const address = order.shippingAddress
    body = (
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small">Placed {formatDateTime(order.createdAt)}</AppText>
          <Row label="Payment" value={`${humanize(order.paymentMethod)}, ${humanize(payment?.status || order.paymentStatus)}`} />
          <Row label="Total" value={formatPrice(order.total)} bold />
        </Card>

        {order.statusHistory?.length ? (
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="small">Progress</AppText>
            {order.statusHistory.map((step, i) => (
              <View key={`${step.status}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                <AppText variant="label">{humanize(step.status)}</AppText>
                <AppText variant="small">{formatDateTime(step.at)}</AppText>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small">Items</AppText>
          {order.items.map((item, i) => (
            <Row key={`${item.productName}-${i}`} label={`${item.quantity} × ${item.productName}`} value={formatPrice(item.totalPrice)} />
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.xs }} />
          <Row label="Subtotal" value={formatPrice(order.subtotal)} />
          <Row label="Delivery" value={formatPrice(order.deliveryFee)} />
          {order.discount > 0 ? <Row label="Discount" value={`-${formatPrice(order.discount)}`} /> : null}
          <Row label="Total" value={formatPrice(order.total)} bold />
        </Card>

        {address ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="small">Customer</AppText>
            <AppText variant="strong">{address.name}</AppText>
            <AppText>{addressLine(address)}</AppText>
            {address.phone ? <Button title={`Call ${address.phone}`} variant="outline" onPress={() => Linking.openURL(telUrl(address.phone)).catch(() => {})} style={{ marginTop: spacing.sm }} /> : null}
          </Card>
        ) : null}

        {delivery && can(user, 'delivery.view') ? (
          <Button
            title={`Delivery: ${humanize(delivery.status)}`}
            variant="outline"
            onPress={() => router.push({ pathname: `/shipment/${delivery._id}`, params: { orderNumber: order.orderNumber } })}
          />
        ) : null}
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={remote.refreshing} onRefresh={remote.reload} tintColor={colors.pine} colors={[colors.pine]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" accessibilityRole="header">
              {order?.orderNumber || 'Order'}
            </AppText>
          </View>
          {order ? <StatusPill value={order.orderStatus} /> : null}
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <OrderDetail id={String(id)} />
    </RequireRole>
  )
}
