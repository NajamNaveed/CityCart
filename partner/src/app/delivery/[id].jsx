import { useState } from 'react'
import { Linking, RefreshControl, ScrollView, View } from 'react-native'
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
import TextField from '../../components/ui/TextField'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { completeDelivery, fetchDelivery, setDeliveryStatus } from '../../services/deliveries'
import { addressLine, canComplete, cashSummary, codeErrorMessage, isClosed, mapsUrl, nextMoves, telUrl } from '../../utils/delivery'
import { formatPrice } from '../../utils/format'
import { CODE_LENGTH, isValidCode } from '../../utils/validation'
import { colors, radius, spacing } from '../../theme'

function Notice({ tone = 'error', children }) {
  const look = tone === 'ok' ? { bg: colors.successSoft, fg: colors.success } : { bg: colors.dangerSoft, fg: colors.danger }
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: look.bg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
      <AppText variant="small" style={{ color: look.fg }}>
        {children}
      </AppText>
    </View>
  )
}

function DeliveryDetail({ id }) {
  const remote = useRemote(id, () => fetchDelivery(id))
  // The newest answer from an action (it carries the updated delivery) wins over the loaded one.
  const [latest, setLatest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone, text }
  const [mode, setMode] = useState(null) // null | 'code' | 'fail'
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')

  const delivery = latest || remote.data

  async function run(action, success) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const updated = await action()
      setLatest(updated)
      setMode(null)
      setCode('')
      setReason('')
      if (success) setNotice({ tone: 'ok', text: success })
    } catch (err) {
      setNotice({ tone: 'error', text: err.codeMessage || getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const move = (status, label) => run(() => setDeliveryStatus(id, status), `Marked as ${label.toLowerCase()}.`)

  const complete = () =>
    run(
      async () => {
        try {
          return await completeDelivery(id, code)
        } catch (err) {
          // Say what happened to the code (tries left, locked) instead of a generic error.
          throw Object.assign(err, { codeMessage: codeErrorMessage(err) })
        }
      },
      'Delivered. Thank you!',
    )

  const fail = () => run(() => setDeliveryStatus(id, 'FAILED', reason.trim()), 'Marked as not delivered.')

  async function open(url) {
    try {
      await Linking.openURL(url)
    } catch {
      setNotice({ tone: 'error', text: 'Could not open that on this phone.' })
    }
  }

  let body
  if (!delivery && remote.status === 'loading') {
    body = (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={140} />
        <Skeleton height={100} />
      </View>
    )
  } else if (!delivery) {
    body = (
      <EmptyState
        icon="alert-circle"
        tone="error"
        title={remote.httpStatus === 404 ? 'Delivery not found' : "Couldn't load this delivery"}
        message={remote.httpStatus === 404 ? 'It may have been given to someone else.' : remote.error}
        action={remote.httpStatus === 404 ? null : <Button title="Try again" onPress={remote.reload} />}
      />
    )
  } else {
    const cash = cashSummary(delivery)
    const moves = nextMoves(delivery.status)
    const closed = isClosed(delivery.status)
    const map = mapsUrl(delivery.address)
    body = (
      <>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        {delivery.address ? (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            <AppText variant="small">Deliver to</AppText>
            <AppText variant="heading">{delivery.address.name}</AppText>
            <AppText>{addressLine(delivery.address)}</AppText>
            {delivery.address.additionalInstructions ? <AppText variant="small">Note: {delivery.address.additionalInstructions}</AppText> : null}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
              {delivery.address.phone ? <Button title="Call" variant="outline" onPress={() => open(telUrl(delivery.address.phone))} style={{ flex: 1 }} /> : null}
              {map ? <Button title="Open in Maps" variant="outline" onPress={() => open(map)} style={{ flex: 1 }} /> : null}
            </View>
          </Card>
        ) : (
          <Card style={{ marginBottom: spacing.lg }}>
            <AppText variant="small">This delivery is closed, so the customer details are no longer shown.</AppText>
          </Card>
        )}

        <Card style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
          {cash.kind === 'collect' ? (
            <>
              <AppText variant="small">Collect in cash</AppText>
              <AppText variant="big" style={{ color: colors.pine }}>
                {formatPrice(cash.amount)}
              </AppText>
            </>
          ) : (
            <AppText variant="strong">{cash.kind === 'collected' ? 'Cash collected' : 'Already paid online. Collect nothing.'}</AppText>
          )}
        </Card>

        {delivery.items?.length ? (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            <AppText variant="small">Items to hand over</AppText>
            {delivery.items.map((item, i) => (
              <AppText key={`${item.productName}-${i}`}>
                {item.quantity} × {item.productName}
              </AppText>
            ))}
          </Card>
        ) : null}

        {delivery.status === 'FAILED' && delivery.failureReason ? (
          <Card style={{ marginBottom: spacing.lg }}>
            <AppText variant="small">Last attempt failed: {delivery.failureReason}</AppText>
          </Card>
        ) : null}

        {!closed ? (
          <View style={{ gap: spacing.md }}>
            {moves.map((m) => (
              <Button key={m.status} title={m.label} onPress={() => move(m.status, m.label)} loading={busy && mode === null} disabled={busy} />
            ))}

            {canComplete(delivery.status) && mode !== 'fail' ? (
              mode === 'code' ? (
                <Card style={{ gap: spacing.md }}>
                  <TextField
                    label="Customer's delivery code"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))}
                    keyboardType="number-pad"
                    maxLength={CODE_LENGTH}
                    autoComplete="off"
                    placeholder="6 digits"
                    returnKeyType="done"
                    onSubmitEditing={() => isValidCode(code) && complete()}
                  />
                  <AppText variant="small">Ask the customer for the 6-digit code shown in their app.</AppText>
                  <Button title="Complete delivery" onPress={complete} loading={busy} disabled={!isValidCode(code)} />
                  <Button title="Cancel" variant="outline" onPress={() => { setMode(null); setCode('') }} disabled={busy} />
                </Card>
              ) : (
                <Button title="Enter code to complete" onPress={() => { setNotice(null); setMode('code') }} disabled={busy} />
              )
            ) : null}

            {canComplete(delivery.status) && mode !== 'code' ? (
              mode === 'fail' ? (
                <Card style={{ gap: spacing.md }}>
                  <TextField label="Why could it not be delivered?" value={reason} onChangeText={setReason} maxLength={300} placeholder="For example: customer not reachable" />
                  <Button title="Mark as not delivered" variant="danger" onPress={fail} loading={busy} disabled={!reason.trim()} />
                  <Button title="Cancel" variant="outline" onPress={() => { setMode(null); setReason('') }} disabled={busy} />
                </Card>
              ) : (
                <Button title="Could not deliver" variant="danger" onPress={() => { setNotice(null); setMode('fail') }} disabled={busy} />
              )
            ) : null}
          </View>
        ) : null}
      </>
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
              {delivery?.orderNumber || 'Delivery'}
            </AppText>
          </View>
          {delivery ? <StatusPill value={delivery.status} /> : null}
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams()
  return (
    <RequireRole role="RIDER">
      <DeliveryDetail id={String(id)} />
    </RequireRole>
  )
}
