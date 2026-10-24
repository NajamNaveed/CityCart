import { RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import BackButton from '../../components/BackButton'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { useRemote } from '../../hooks/useRemote'
import { fetchReceipt } from '../../services/records'
import { formatDateTime, formatPrice, humanize } from '../../utils/format'
import { colors, spacing } from '../../theme'

function Row({ label, value, bold }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant={bold ? 'strong' : 'small'}>{label}</AppText>
      <AppText variant={bold ? 'strong' : 'label'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  )
}

function ReceiptDetail({ id }) {
  const remote = useRemote(`receipt:${id}`, () => fetchReceipt(id))
  const receipt = remote.data

  let body
  if (remote.status === 'loading') {
    body = <Skeleton height={240} />
  } else if (remote.status === 'error') {
    body = (
      <EmptyState
        icon="alert-circle"
        tone="error"
        title={remote.httpStatus === 404 ? 'Receipt not found' : "Couldn't load this receipt"}
        message={remote.error}
        action={remote.httpStatus === 404 ? null : <Button title="Try again" onPress={remote.reload} />}
      />
    )
  } else {
    body = (
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.sm }}>
          <Row label="Brand" value={receipt.brandName} />
          <Row label="Order" value={receipt.orderNumber} />
          {receipt.billedTo ? <Row label="Billed to" value={receipt.billedTo} /> : null}
          <Row label="Issued" value={formatDateTime(receipt.issuedAt)} />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small">Items</AppText>
          {receipt.items.map((item, i) => (
            <Row key={`${item.productName}-${i}`} label={`${item.quantity} × ${item.productName}`} value={formatPrice(item.totalPrice)} />
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.xs }} />
          <Row label="Subtotal" value={formatPrice(receipt.subtotal)} />
          <Row label="Delivery" value={formatPrice(receipt.deliveryFee)} />
          {receipt.discount > 0 ? <Row label="Discount" value={`-${formatPrice(receipt.discount)}`} /> : null}
          {receipt.tax > 0 ? <Row label="Tax" value={formatPrice(receipt.tax)} /> : null}
          <Row label="Paid" value={formatPrice(receipt.amount)} bold />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Row label="Method" value={humanize(receipt.method)} />
          {receipt.transactionReference ? <Row label="Reference" value={receipt.transactionReference} /> : null}
          {receipt.collectedByName ? <Row label="Cash taken by" value={receipt.collectedByName} /> : null}
        </Card>
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
              {receipt?.receiptNumber || 'Receipt'}
            </AppText>
          </View>
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <ReceiptDetail id={String(id)} />
    </RequireRole>
  )
}
