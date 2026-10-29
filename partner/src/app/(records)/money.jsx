import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import FilterChips from '../../components/FilterChips'
import ListRow from '../../components/ListRow'
import ListScreen from '../../components/ListScreen'
import Screen from '../../components/ui/Screen'
import Skeleton from '../../components/ui/Skeleton'
import { usePagedList } from '../../hooks/usePagedList'
import { useRemote } from '../../hooks/useRemote'
import { fetchCashCollectors, fetchProofQueue, fetchReceipts } from '../../services/records'
import { formatDateTime, formatPaymentMethod, formatPrice } from '../../utils/format'
import { colors, radius, spacing, weights } from '../../theme'

const SEGMENTS = [
  ['receipts', 'Receipts'],
  ['proofs', 'To verify'],
  ['cash', 'Cash'],
]

function Receipts({ segments }) {
  const router = useRouter()
  const list = usePagedList('records-receipts', (page) => fetchReceipts(page))
  return (
    <ListScreen
      title="Money"
      header={segments}
      list={list}
      keyExtractor={(receipt) => receipt._id}
      empty={{ icon: 'file-text', title: 'No receipts yet', message: 'A receipt is made when an order is paid.' }}
      renderItem={({ item }) => (
        <ListRow
          title={item.receiptNumber}
          subtitle={`${item.orderNumber}, ${formatPaymentMethod(item.collectionMethod || item.method, item.collectionWallet)}`}
          right={formatPrice(item.amount)}
          rightSub={formatDateTime(item.issuedAt)}
          onPress={() => router.push(`/receipt/${item._id}`)}
        />
      )}
    />
  )
}

// A reminder that the same reference or photo was used on another payment.
function DuplicatePill() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderColor: 'rgba(180,83,9,0.25)', backgroundColor: colors.warningSoft }}>
      <Feather name="alert-triangle" size={12} color={colors.warning} />
      <AppText variant="small" style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.warning, fontWeight: weights.medium }}>
        Used before
      </AppText>
    </View>
  )
}

// Non-cash payments taken at the door wait here until someone checks the brand's
// statement against the photo and the reference (docs/21 §I.3).
function Proofs({ segments }) {
  const router = useRouter()
  const list = usePagedList('records-proofs', (page) => fetchProofQueue('SUBMITTED', page))

  // Coming back from a decision shows the queue without that payment.
  const refreshRef = useRef(list.refresh)
  useEffect(() => {
    refreshRef.current = list.refresh
  })
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      refreshRef.current()
    }, []),
  )

  return (
    <ListScreen
      title="Money"
      header={segments}
      list={list}
      keyExtractor={(proof) => proof.paymentId}
      empty={{
        icon: 'check-circle',
        title: 'Nothing to verify',
        message: 'Non-cash payments taken at the door wait here until the money is checked.',
      }}
      renderItem={({ item }) => (
        <ListRow
          title={item.orderNumber || 'Payment'}
          subtitle={`${formatPaymentMethod(item.method, item.wallet)}, ${item.reference}`}
          right={formatPrice(item.amount)}
          rightSub={formatDateTime(item.submittedAt)}
          pill={item.duplicateReference || item.duplicateProof ? <DuplicatePill /> : null}
          onPress={() => router.push(`/proof/${item.paymentId}`)}
        />
      )}
    />
  )
}

function Cash({ segments }) {
  const router = useRouter()
  const cash = useRemote('records-cash', fetchCashCollectors)
  const total = (cash.data || []).reduce((sum, c) => sum + c.total, 0)

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
        <AppText variant="title" accessibilityRole="header">
          Money
        </AppText>
      </View>
      {segments}
      <Screen title={null} scroll refreshing={cash.refreshing} onRefresh={cash.reload} edges={['left', 'right']}>
        {cash.status === 'loading' ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={96} />
            <Skeleton height={96} />
          </View>
        ) : cash.status === 'error' ? (
          <EmptyState icon="wifi-off" tone="error" title="Couldn't load the cash" message={cash.error} action={<Button title="Try again" onPress={cash.reload} />} />
        ) : cash.data.length === 0 ? (
          <EmptyState icon="check-circle" title="No cash waiting" message="Nobody is holding cash that has not been handed over." />
        ) : (
          <View style={{ gap: spacing.md }}>
            <Card style={{ gap: 2 }}>
              <AppText variant="small">Cash still with riders</AppText>
              <AppText variant="big" style={{ color: colors.pine }}>
                {formatPrice(total)}
              </AppText>
            </Card>
            {cash.data.map((c) => (
              <Pressable
                key={c.collectorId}
                onPress={() => router.push({ pathname: `/handover/${c.collectorId}`, params: { name: c.name } })}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${c.count} payments, ${formatPrice(c.total)}`}
                style={({ pressed }) => ({ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface, gap: 2 })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <AppText variant="strong">{c.name}</AppText>
                  <AppText variant="strong" style={{ color: colors.pine }}>
                    {formatPrice(c.total)}
                  </AppText>
                </View>
                <AppText variant="small">
                  {c.count} {c.count === 1 ? 'payment' : 'payments'}, oldest {formatDateTime(c.oldest)}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
      </Screen>
    </SafeAreaView>
  )
}

export default function Money() {
  const [segment, setSegment] = useState('receipts')
  const segments = <FilterChips options={SEGMENTS} value={segment} onChange={setSegment} />
  if (segment === 'proofs') return <Proofs segments={segments} />
  return segment === 'receipts' ? <Receipts segments={segments} /> : <Cash segments={segments} />
}
