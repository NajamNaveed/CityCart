import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import BackButton from '../../components/BackButton'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import { useAuth } from '../../hooks/useAuth'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { fetchCollectorCash, settleCash } from '../../services/records'
import { formatDateTime, formatPrice } from '../../utils/format'
import { can } from '../../utils/permissions'
import { colors, minTouch, radius, spacing } from '../../theme'

// Counting the cash a rider hands over: tick exactly the payments you received,
// confirm, and they are marked settled (all or nothing on the server).
function Handover({ collectorId, name }) {
  const { user } = useAuth()
  const remote = useRemote(`handover:${collectorId}`, () => fetchCollectorCash(collectorId))
  const canSettle = can(user, 'payments.manage')

  const [picked, setPicked] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const payments = remote.data?.payments || []
  const chosen = payments.filter((p) => picked[p.paymentId])
  const chosenTotal = chosen.reduce((sum, p) => sum + p.amount, 0)

  const toggle = (id) => setPicked((prev) => ({ ...prev, [id]: !prev[id] }))
  const pickAll = () => setPicked(Object.fromEntries(payments.map((p) => [p.paymentId, true])))

  async function confirm() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await settleCash(collectorId, chosen.map((p) => p.paymentId))
      setNotice({ ok: true, text: `Marked ${formatPrice(result.total)} as received from ${name}.` })
    } catch (err) {
      const changed = err.response?.data?.code === 'CASH_CHANGED'
      setNotice({ ok: false, text: changed ? 'The cash changed since you opened this. The list was reloaded: count again.' : getErrorMessage(err) })
    } finally {
      setPicked({})
      setConfirming(false)
      setBusy(false)
      remote.reload()
    }
  }

  let body
  if (remote.status === 'loading') {
    body = <Skeleton height={160} />
  } else if (remote.status === 'error') {
    body = <EmptyState icon="wifi-off" tone="error" title="Couldn't load the cash" message={remote.error} action={<Button title="Try again" onPress={remote.reload} />} />
  } else if (payments.length === 0) {
    body = <EmptyState icon="check-circle" title="All handed over" message={`${name} has no cash waiting.`} />
  } else {
    body = (
      <View style={{ gap: spacing.md }}>
        <Card style={{ gap: 2 }}>
          <AppText variant="small">{name} is holding</AppText>
          <AppText variant="big" style={{ color: colors.pine }}>
            {formatPrice(remote.data.total)}
          </AppText>
        </Card>

        {canSettle ? <Button title="Select all" variant="outline" onPress={pickAll} /> : <AppText variant="small">Only team members who manage payments can mark cash as received.</AppText>}

        {payments.map((p) => {
          const on = Boolean(picked[p.paymentId])
          return (
            <Pressable
              key={p.paymentId}
              onPress={canSettle ? () => toggle(p.paymentId) : undefined}
              accessibilityRole={canSettle ? 'checkbox' : undefined}
              accessibilityState={canSettle ? { checked: on } : undefined}
              accessibilityLabel={`${p.orderNumber || 'Order'}, ${formatPrice(p.amount)}`}
              style={({ pressed }) => ({ minHeight: minTouch, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: on ? colors.pine : colors.line, backgroundColor: on ? colors.pineSoft : pressed ? colors.sand : colors.surface })}
            >
              {canSettle ? <Feather name={on ? 'check-square' : 'square'} size={22} color={on ? colors.pine : colors.muted} /> : null}
              <View style={{ flex: 1 }}>
                <AppText variant="strong">{p.orderNumber || 'Order'}</AppText>
                <AppText variant="small">{formatDateTime(p.collectedAt)}</AppText>
              </View>
              <AppText variant="strong">{formatPrice(p.amount)}</AppText>
            </Pressable>
          )
        })}

        {canSettle && chosen.length > 0 ? (
          confirming ? (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="strong">
                Confirm you received {formatPrice(chosenTotal)} from {name}?
              </AppText>
              <AppText variant="small">
                {chosen.length} {chosen.length === 1 ? 'payment' : 'payments'} will be marked as handed over. This cannot be undone here.
              </AppText>
              <Button title="Yes, received" onPress={confirm} loading={busy} />
              <Button title="Cancel" variant="outline" onPress={() => setConfirming(false)} disabled={busy} />
            </Card>
          ) : (
            <Button title={`Mark ${formatPrice(chosenTotal)} received`} onPress={() => setConfirming(true)} />
          )
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
              {name}
            </AppText>
          </View>
        </View>
        {notice ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: notice.ok ? colors.successSoft : colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
            <AppText variant="small" style={{ color: notice.ok ? colors.success : colors.danger }}>
              {notice.text}
            </AppText>
          </View>
        ) : null}
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function HandoverScreen() {
  const { collectorId, name } = useLocalSearchParams()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <Handover collectorId={String(collectorId)} name={typeof name === 'string' && name ? name : 'This person'} />
    </RequireRole>
  )
}
