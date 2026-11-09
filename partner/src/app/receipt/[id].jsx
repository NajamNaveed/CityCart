import { RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import BackButton from '../../components/BackButton'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DetailRow from '../../components/ui/DetailRow'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { useRemote } from '../../hooks/useRemote'
import { fetchReceipt } from '../../services/records'
import { formatDateTime, formatPaymentMethod, formatPrice } from '../../utils/format'
import { colors, spacing } from '../../theme'

// The brand's view of a non-cash payment at the door: checked, waiting, or rejected.
const PROOF_CHECKS = { SUBMITTED: 'Waiting to be checked', VERIFIED: 'Checked', REJECTED: 'Rejected' }

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
          <DetailRow label="Brand" value={receipt.brandName} />
          <DetailRow label="Order" value={receipt.orderNumber} />
          {receipt.billedTo ? <DetailRow label="Billed to" value={receipt.billedTo} /> : null}
          <DetailRow label="Issued" value={formatDateTime(receipt.issuedAt)} />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small">Items</AppText>
          {receipt.items.map((item, i) => (
            <DetailRow key={`${item.productName}-${i}`} label={`${item.quantity} × ${item.productName}`} value={formatPrice(item.totalPrice)} />
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: spacing.xs }} />
          <DetailRow label="Subtotal" value={formatPrice(receipt.subtotal)} />
          <DetailRow label="Delivery" value={formatPrice(receipt.deliveryFee)} />
          {receipt.discount > 0 ? <DetailRow label="Discount" value={`-${formatPrice(receipt.discount)}`} /> : null}
          {receipt.tax > 0 ? <DetailRow label="Tax" value={formatPrice(receipt.tax)} /> : null}
          <DetailRow label="Paid" value={formatPrice(receipt.amount)} bold />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <DetailRow label="Method" value={formatPaymentMethod(receipt.collectionMethod || receipt.method, receipt.collectionWallet)} />
          {receipt.collectionReference || receipt.transactionReference ? (
            <DetailRow label="Reference" value={receipt.collectionReference || receipt.transactionReference} />
          ) : null}
          {receipt.proofVerification ? <DetailRow label="Payment check" value={PROOF_CHECKS[receipt.proofVerification] || receipt.proofVerification} /> : null}
          {receipt.collectedByName ? <DetailRow label="Cash taken by" value={receipt.collectedByName} /> : null}
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
