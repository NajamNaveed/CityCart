import { useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
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
import { getErrorMessage } from '../../services/api'
import { assignRider, fetchActiveRiders, fetchShipment } from '../../services/records'
import { addressLine, isClosed, telUrl } from '../../utils/delivery'
import { formatDateTime } from '../../utils/format'
import { can } from '../../utils/permissions'
import { colors, minTouch, radius, spacing } from '../../theme'

// Giving the delivery to one of the brand's riders (or taking the rider off).
function RiderPicker({ delivery, onChanged }) {
  const riders = useRemote('active-riders', fetchActiveRiders)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  async function choose(riderId, text) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const updated = await assignRider(delivery._id, riderId)
      onChanged(updated)
      setNotice({ ok: true, text })
    } catch (err) {
      setNotice({ ok: false, text: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="small">Rider</AppText>
      {notice ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: notice.ok ? colors.success : colors.danger }}>
          {notice.text}
        </AppText>
      ) : null}
      {riders.status === 'loading' ? <Skeleton height={52} /> : null}
      {riders.status === 'error' ? <AppText variant="small">{riders.error}</AppText> : null}
      {riders.status === 'ready' && riders.data.length === 0 ? <AppText variant="small">There are no active riders. Add one on the website first.</AppText> : null}
      {riders.status === 'ready'
        ? riders.data.map((rider) => {
            const current = String(rider._id) === String(delivery.riderId)
            return (
              <Pressable
                key={rider._id}
                onPress={() => (current ? null : choose(rider._id, `Given to ${rider.name}. They have been told.`))}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: current, disabled: busy }}
                accessibilityLabel={current ? `${rider.name}, assigned` : `Give to ${rider.name}`}
                style={({ pressed }) => ({ minHeight: minTouch, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: current ? colors.pine : colors.line, backgroundColor: current ? colors.pineSoft : pressed ? colors.sand : colors.surface })}
              >
                <AppText variant="label">{current ? `${rider.name} (assigned)` : rider.name}</AppText>
              </Pressable>
            )
          })
        : null}
      {delivery.riderId ? <Button title="Remove rider" variant="outline" onPress={() => choose(null, 'Rider removed.')} disabled={busy} /> : null}
    </Card>
  )
}

function ShipmentDetail({ id, orderNumber }) {
  const { user } = useAuth()
  const remote = useRemote(`shipment:${id}`, () => fetchShipment(id))
  const [latest, setLatest] = useState(null)
  const delivery = latest || remote.data

  const canAssign = can(user, 'delivery.manage') && can(user, 'riders.view')

  let body
  if (!delivery && remote.status === 'loading') {
    body = (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={120} />
        <Skeleton height={100} />
      </View>
    )
  } else if (!delivery) {
    body = (
      <EmptyState
        icon="alert-circle"
        tone="error"
        title={remote.httpStatus === 404 ? 'Delivery not found' : "Couldn't load this delivery"}
        message={remote.error}
        action={remote.httpStatus === 404 ? null : <Button title="Try again" onPress={remote.reload} />}
      />
    )
  } else {
    const closed = isClosed(delivery.status)
    body = (
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="small">Rider</AppText>
          <AppText variant="strong">{delivery.assignedAgent || 'No rider yet'}</AppText>
          {delivery.trackingReference ? <AppText variant="small">Tracking {delivery.trackingReference}</AppText> : null}
          <AppText variant="small">Updated {formatDateTime(delivery.updatedAt)}</AppText>
          {delivery.status === 'FAILED' && delivery.failureReason ? <AppText variant="small">Last attempt failed: {delivery.failureReason}</AppText> : null}
        </Card>

        {delivery.address ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="small">Deliver to</AppText>
            <AppText variant="strong">{delivery.address.name}</AppText>
            <AppText>{addressLine(delivery.address)}</AppText>
            {delivery.address.phone ? <Button title={`Call ${delivery.address.phone}`} variant="outline" onPress={() => Linking.openURL(telUrl(delivery.address.phone)).catch(() => {})} style={{ marginTop: spacing.sm }} /> : null}
          </Card>
        ) : null}

        {canAssign && !closed ? <RiderPicker delivery={delivery} onChanged={setLatest} /> : null}
        {!canAssign && !closed ? <AppText variant="small">You can see this delivery but not change its rider.</AppText> : null}
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={remote.refreshing} onRefresh={() => { setLatest(null); remote.reload() }} tintColor={colors.pine} colors={[colors.pine]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" accessibilityRole="header">
              {orderNumber || 'Delivery'}
            </AppText>
          </View>
          {delivery ? <StatusPill value={delivery.status} /> : null}
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function ShipmentScreen() {
  const { id, orderNumber } = useLocalSearchParams()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <ShipmentDetail id={String(id)} orderNumber={typeof orderNumber === 'string' ? orderNumber : ''} />
    </RequireRole>
  )
}
