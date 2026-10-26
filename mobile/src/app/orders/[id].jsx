import { useState } from 'react'
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import BackButton from '../../components/BackButton'
import OrderProgress from '../../components/OrderProgress'
import ProductImage from '../../components/ProductImage'
import RequireCustomer from '../../components/RequireCustomer'
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useRefreshOnForeground } from '../../hooks/useRefreshOnForeground'
import { useRemote } from '../../hooks/useRemote'
import PayNowButton from '../../components/PayNowButton'
import { getErrorMessage } from '../../services/api'
import { awaitingPayment, canCancel, cancelOrder, CODE_VISIBLE_STATUSES, fetchDeliveryCode, fetchOrder, fetchReceipt, fetchRiderLocation, isOnline, locationMapUrl, TERMINAL_PROBLEMS } from '../../services/orders'
import { formatDateTime, formatPrice, humanize, timeAgo } from '../../utils/format'
import { isObjectId } from '../../utils/ids'
import { colors, radius, spacing } from '../../theme'

function Section({ title, children }) {
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 19 }}>
        {title}
      </AppText>
      {children}
    </View>
  )
}

function Row({ label, value, strong = false }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg }}>
      <AppText variant="small">{label}</AppText>
      <AppText variant={strong ? 'strong' : 'label'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  )
}

// The code the rider asks for at the door. Nothing is shown if the server has none to give.
function DeliveryCode({ deliveryId }) {
  const remote = useRemote(`code:${deliveryId}`, () => fetchDeliveryCode(deliveryId))
  if (remote.status !== 'ready' || !remote.data) return null
  return (
    <Section title="Your delivery code">
      <Card style={{ gap: spacing.sm, alignItems: 'center' }}>
        <AppText variant="title" accessibilityLabel={`Delivery code ${String(remote.data).split('').join(' ')}`} style={{ letterSpacing: 8, fontSize: 34, lineHeight: 42 }}>
          {remote.data}
        </AppText>
        <AppText variant="small" style={{ textAlign: 'center' }}>
          Give this code to the rider when your order arrives. Please do not share it before.
        </AppText>
      </Card>
    </Section>
  )
}

// Where the rider is, if they chose to share it while delivering. Nothing is shown (and nothing is
// claimed) when they are not sharing.
function RiderLocationCard({ deliveryId }) {
  const remote = useRemote(`rider-location:${deliveryId}`, () => fetchRiderLocation(deliveryId))
  if (remote.status !== 'ready' || !remote.data) return null
  return (
    <Section title="Your rider">
      <Card style={{ gap: spacing.sm }}>
        <AppText>Last seen {timeAgo(remote.data.recordedAt)} ago.</AppText>
        <Button title="See on map" variant="outline" onPress={() => Linking.openURL(locationMapUrl(remote.data)).catch(() => {})} />
        <Button title="Refresh" variant="outline" onPress={remote.reload} />
      </Card>
    </Section>
  )
}

// The receipt of a paid order; nothing is shown until one exists.
function ReceiptNote({ orderId }) {
  const remote = useRemote(`receipt:${orderId}`, () => fetchReceipt(orderId))
  if (remote.status !== 'ready' || !remote.data) return null
  return (
    <AppText variant="small" style={{ fontSize: 12 }}>
      Receipt {remote.data.receiptNumber}, issued {formatDateTime(remote.data.issuedAt)}.
    </AppText>
  )
}

function OrderView({ data, refreshing, onRefresh, onChanged }) {
  const router = useRouter()
  const { order, payment, delivery } = data
  const [cancelling, setCancelling] = useState(false)
  const [notice, setNotice] = useState('')
  const a = order.shippingAddress || {}
  const problem = TERMINAL_PROBLEMS[order.orderStatus]
  const hasTracking = delivery && (delivery.trackingReference || delivery.assignedAgent || delivery.status === 'FAILED')
  const showCode = Boolean(delivery) && CODE_VISIBLE_STATUSES.includes(delivery.status)
  const paid = payment?.status === 'PAID'

  async function doCancel() {
    setCancelling(true)
    setNotice('')
    try {
      const updated = await cancelOrder(order._id)
      onChanged({ ...data, order: { ...order, ...updated } })
      setNotice('Your order has been cancelled.')
    } catch (err) {
      setNotice(getErrorMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  const confirmCancel = () =>
    Alert.alert('Cancel this order?', 'The brand has not confirmed it yet, so you can cancel for free. The reserved stock goes back on sale.', [
      { text: 'Keep my order', style: 'cancel' },
      { text: 'Yes, cancel it', style: 'destructive', onPress: doCancel },
    ])

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.clay} colors={[colors.clay]} />}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32 }}>
          {order.orderNumber}
        </AppText>
        <AppText variant="small">
          Placed {formatDateTime(order.createdAt)}
          {order.brandName ? ` · ${order.brandName}` : ''}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatusPill value={order.orderStatus} />
          {payment ? <StatusPill value={payment.status} label={`Payment ${humanize(payment.status).toLowerCase()}`} /> : null}
          {delivery ? <StatusPill value={delivery.status} /> : null}
        </View>
      </View>

      {notice ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="small" style={{ color: colors.info }}>
            {notice}
          </AppText>
        </View>
      ) : null}

      <Section title="Progress">
        {problem ? (
          <View style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md }}>
            <Feather name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText variant="small" style={{ color: colors.danger }}>
                {problem}
              </AppText>
              {order.cancellationReason || order.rejectionReason ? (
                <AppText variant="small" style={{ color: colors.danger, marginTop: 4 }}>
                  Reason: {order.cancellationReason || order.rejectionReason}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : (
          <OrderProgress history={order.statusHistory} orderStatus={order.orderStatus} />
        )}
        {canCancel(order) ? <Button title="Cancel order" variant="outline" onPress={confirmCancel} loading={cancelling} /> : null}
      </Section>

      {awaitingPayment({ order, payment }) ? (
        <Section title="Waiting for your payment">
          <Card style={{ gap: spacing.md }}>
            <AppText variant="small">
              {payment.expiresAt ? `Pay before ${new Date(payment.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, or this order is cancelled and its items go back on sale. ` : ''}
              The brand starts on your order once the payment is confirmed.
            </AppText>
            <PayNowButton orderId={order._id} />
          </Card>
        </Section>
      ) : null}

      {delivery?.status === 'OUT_FOR_DELIVERY' ? <RiderLocationCard deliveryId={delivery._id} /> : null}

      {showCode ? <DeliveryCode deliveryId={delivery._id} /> : null}

      <Section title="Items">
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
          {order.items.map((item, i) => (
            <Pressable
              key={`${item.productId}-${i}`}
              onPress={() => router.push(`/product/${item.productId}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, quantity ${item.quantity}, ${formatPrice(item.lineTotal)}. Open product`}
              style={[{ flexDirection: 'row', gap: spacing.md, padding: spacing.md, alignItems: 'center' }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
            >
              <ProductImage src={item.image} name={item.name} width={56} style={{ width: 56, height: 70, borderRadius: radius.sm }} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText variant="small">
                  {item.quantity} × {formatPrice(item.unitPrice)}
                </AppText>
              </View>
              <AppText variant="strong">{formatPrice(item.lineTotal)}</AppText>
            </Pressable>
          ))}
        </View>
        <Card style={{ gap: spacing.sm }}>
          <Row label="Subtotal" value={formatPrice(order.subtotal)} />
          {order.shippingFee > 0 ? <Row label="Delivery" value={formatPrice(order.shippingFee)} /> : null}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm }}>
            <Row label="Total" value={formatPrice(order.total)} strong />
          </View>
          <AppText variant="small" style={{ fontSize: 12 }}>
            {payment?.status === 'PAID'
              ? isOnline(order) ? 'Paid online.' : 'Paid in cash on delivery.'
              : isOnline(order) ? 'To be paid online.' : 'Pay in cash when your order arrives.'}
          </AppText>
          {paid ? <ReceiptNote orderId={order._id} /> : null}
        </Card>
      </Section>

      <Section title="Delivering to">
        <Card style={{ gap: 2 }}>
          <AppText variant="strong">{a.name}</AppText>
          <AppText variant="small" style={{ color: colors.ink }}>
            {a.address}
          </AppText>
          <AppText variant="small" style={{ color: colors.ink }}>
            {[a.city, a.state, a.postalCode].filter(Boolean).join(', ')}
          </AppText>
          {a.phone ? <AppText variant="small">{a.phone}</AppText> : null}
          {a.additionalInstructions ? (
            <AppText variant="small" style={{ marginTop: spacing.sm }}>
              Notes: {a.additionalInstructions}
            </AppText>
          ) : null}
        </Card>
      </Section>

      {hasTracking ? (
        <Section title="Delivery tracking">
          <Card style={{ gap: spacing.sm }}>
            {delivery.trackingReference ? <Row label="Tracking number" value={delivery.trackingReference} /> : null}
            {delivery.assignedAgent ? <Row label="Courier" value={delivery.assignedAgent} /> : null}
            {delivery.status === 'FAILED' && delivery.failureReason ? (
              <AppText variant="small" style={{ color: colors.danger }}>
                Delivery problem: {delivery.failureReason}
              </AppText>
            ) : null}
          </Card>
        </Section>
      ) : null}
    </ScrollView>
  )
}

export default function OrderScreen() {
  const { id: rawId } = useLocalSearchParams()
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const { user } = useAuth()
  const valid = isObjectId(id)
  const signedIn = user?.role === 'CUSTOMER'
  // Nothing is requested for a visitor who is not signed in (the screen asks them to sign in instead),
  // and a malformed id is answered here without troubling the server.
  const remote = useRemote(`order:${signedIn ? user.id : 'none'}:${id}`, () => {
    if (!signedIn) return Promise.resolve(null)
    return valid ? fetchOrder(id) : Promise.reject(Object.assign(new Error('bad id'), { response: { status: 400, data: {} } }))
  })
  // A change made here (cancelling) is shown until the next read replaces it.
  const [changed, setChanged] = useState(null)
  const data = changed && changed.base === remote.data ? changed.value : remote.data
  const gone = remote.httpStatus === 404 || remote.httpStatus === 400
  const refresh = () => {
    setChanged(null)
    remote.reload()
  }
  // Back from paying in the browser: look again, so a payment that went through shows at once.
  useRefreshOnForeground(() => {
    if (data && awaitingPayment(data)) refresh()
  })

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Order
        </AppText>
      </View>
      <RequireCustomer next={`/orders/${id}`} icon="package" title="Sign in to see this order" message="Orders are only shown to the account that placed them.">
        {remote.status === 'loading' ? (
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            <Skeleton height={60} />
            <Skeleton height={200} />
            <Skeleton height={120} />
          </View>
        ) : remote.status === 'error' ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState
              icon={gone ? 'package' : 'wifi-off'}
              tone={gone ? 'default' : 'error'}
              title={gone ? 'Order not found' : "Couldn't load this order"}
              message={gone ? 'It may belong to a different account, or no longer exist.' : remote.error}
              action={gone ? undefined : <Button title="Try again" onPress={refresh} />}
            />
          </View>
        ) : (
          <OrderView data={data} refreshing={remote.refreshing} onRefresh={refresh} onChanged={(value) => setChanged({ base: remote.data, value })} />
        )}
      </RequireCustomer>
    </SafeAreaView>
  )
}
