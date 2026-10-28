import { useState } from 'react'
import { Alert, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import Button from './ui/Button'
import Card from './ui/Card'
import StatusPill from './StatusPill'
import { respondToAdjustment } from '../services/orders'
import { getErrorMessage } from '../services/api'
import { formatDateTime, formatPrice } from '../utils/format'
import { colors, spacing } from '../theme'

const DONE = {
  ACCEPT: 'Change accepted. Your order now has the items the brand can send.',
  REMOVE: 'Your order was updated to the items the brand can send.',
  CANCEL_ORDER: 'Your order was cancelled.',
}

const lineText = (line) => {
  const supplied = `${line.supplyQuantity} of ${line.orderedQuantity} × ${line.productName}`
  return line.substitute
    ? `${supplied}, plus ${line.substitute.quantity} × ${line.substitute.productName} instead`
    : `${supplied} — the rest will be removed`
}

export default function OrderChangeCard({ order, adjustment, onDone }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function respond(action) {
    setBusy(action)
    setError('')
    try {
      const result = await respondToAdjustment(order._id, adjustment._id, action)
      const refund = result.refundAmount
      onDone(refund ? `${DONE[action]} ${formatPrice(refund)} will be returned to your payment method.` : DONE[action])
    } catch (err) {
      setError(getErrorMessage(err))
      if (err.response?.data?.code === 'ADJUSTMENT_EXPIRED' || err.response?.data?.code === 'ADJUSTMENT_NOT_PENDING') onDone('')
    } finally {
      setBusy('')
    }
  }

  const confirmCancel = () =>
    Alert.alert(
      'Cancel the whole order?',
      'The order will be cancelled. The remaining items and any substitute go back on sale.',
      [
        { text: 'Keep my order', style: 'cancel' },
        { text: 'Yes, cancel it', style: 'destructive', onPress: () => respond('CANCEL_ORDER') },
      ],
    )

  return (
    <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 19 }}>
            The brand proposed a change
          </AppText>
          <AppText variant="small" style={{ marginTop: 2 }}>
            Reply by {formatDateTime(adjustment.expiresAt)}. If you do nothing, your order stays as it is.
          </AppText>
        </View>
        <StatusPill value={adjustment.status} />
      </View>

      <AppText>{adjustment.note}</AppText>

      <View style={{ gap: spacing.xs }}>
        {adjustment.lines.map((line) => (
          <AppText key={String(line.orderItemId)} variant="small" style={{ color: colors.ink }}>
            • {lineText(line)}
          </AppText>
        ))}
      </View>

      <View style={{ gap: spacing.xs, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="small">Order total now</AppText>
          <AppText variant="label">{formatPrice(adjustment.totalsBefore.total)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="small">If you accept the change</AppText>
          <AppText variant="strong">{formatPrice(adjustment.totalsAfter.total)}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
          <AppText variant="small">If you keep only what they can send</AppText>
          <AppText variant="strong">{formatPrice(adjustment.totalsAfterRemoval.total)}</AppText>
        </View>
      </View>

      <AppText variant="small" style={{ fontSize: 12 }}>
        Delivery and discounts stay the same.
        {order.paymentMethod === 'ONLINE_GATEWAY' && order.paymentStatus === 'PAID'
          ? ' If the new total is lower, the difference goes back to your payment method.'
          : ''}
      </AppText>

      {error ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md }}>
          <Feather name="alert-circle" size={16} color={colors.clay} style={{ marginTop: 1 }} />
          <AppText variant="small" style={{ color: colors.clay, flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : null}

      <Button title="Accept the change" variant="clay" onPress={() => respond('ACCEPT')} loading={busy === 'ACCEPT'} disabled={Boolean(busy)} />
      <Button title="Keep only what they can send" variant="outline" onPress={() => respond('REMOVE')} loading={busy === 'REMOVE'} disabled={Boolean(busy)} />
      <Button title="Cancel the whole order" variant="outline" onPress={confirmCancel} disabled={Boolean(busy)} />
    </Card>
  )
}
