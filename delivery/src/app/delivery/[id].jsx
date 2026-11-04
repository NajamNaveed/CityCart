import { useState } from 'react'
import { Image, Linking, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import BackButton from '../../components/BackButton'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DestinationMap from '../../components/DestinationMap'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import StatusPill from '../../components/StatusPill'
import TextField from '../../components/ui/TextField'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { completeDelivery, fetchDelivery, requestProofUpload, requestReturnUpload, setDeliveryStatus, uploadPaymentProof, uploadReturnPhoto } from '../../services/deliveries'
import {
  RETURN_REASON_OPTIONS,
  WALLETS,
  acceptanceFrom,
  acceptanceReady,
  acceptanceSummary,
  addressLine,
  canComplete,
  cashSummary,
  codeErrorMessage,
  collectionPayload,
  collectionReady,
  isClosed,
  linesPayload,
  locationMapUrl,
  mapsUrl,
  nextMoves,
  paymentMethodsFor,
  proofErrorMessage,
  returnErrorMessage,
  setAcceptedQty,
  telUrl,
} from '../../utils/delivery'
import { formatPrice } from '../../utils/format'
import { CODE_LENGTH, isValidCode } from '../../utils/validation'
import { colors, radius, spacing } from '../../theme'

const EMPTY_PAYMENT = { method: null, wallet: 'JAZZCASH', reference: '', proof: null, photo: null, asset: null }

const PROOF_STATUS = {
  SUBMITTED: 'Waiting for the brand to check the payment.',
  VERIFIED: 'The brand checked this payment.',
  REJECTED: 'The brand could not match this payment.',
}

const CODE_ERRORS = new Set(['INVALID_CODE', 'CODE_LOCKED', 'NO_DELIVERY_CODE'])
const RETURN_ERRORS = new Set([
  'INVALID_RETURN_QUANTITY',
  'INVALID_RETURN_REASON',
  'INVALID_RETURN_LINES',
  'RETURN_PHOTO_NOT_CONFIGURED',
  'RETURN_PHOTO_NOT_YOURS',
])

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

/**
 * What the customer kept at the door, line by line (docs/22 §F). The rider
 * counts the units and, for anything coming back, picks a reason and may add a
 * photo. Every amount here is a preview; the server recomputes the final ones.
 */
function ItemReview({ lines, delivery, busy, photoBusy, onAccepted, onReason, onPhoto, onContinue, onBack }) {
  const summary = acceptanceSummary(lines, delivery)
  const prepaid = delivery.paymentMethod !== 'COD'
  const ready = acceptanceReady(lines)
  const locked = busy || photoBusy !== null

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="small">What did the customer keep?</AppText>
      {lines.map((line, index) => (
        <View
          key={line.itemId || index}
          style={{
            gap: spacing.xs,
            borderTopWidth: index ? 1 : 0,
            borderTopColor: colors.line,
            paddingTop: index ? spacing.md : 0,
          }}
        >
          <AppText variant="strong">{line.productName}</AppText>
          <AppText variant="small">
            {line.quantity} ordered · {formatPrice(line.lineTotal)}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Button
              title="−"
              variant="outline"
              onPress={() => onAccepted(index, line.acceptedQty - 1)}
              disabled={locked || line.acceptedQty === 0}
              style={{ width: 52, paddingHorizontal: 0 }}
            />
            <AppText variant="strong" style={{ flex: 1, textAlign: 'center' }}>
              {line.acceptedQty} kept · {line.rejectedQty} refused
            </AppText>
            <Button
              title="+"
              variant="outline"
              onPress={() => onAccepted(index, line.acceptedQty + 1)}
              disabled={locked || line.acceptedQty === line.quantity}
              style={{ width: 52, paddingHorizontal: 0 }}
            />
          </View>

          {line.rejectedQty > 0 ? (
            <>
              <AppText variant="small">Why is it coming back?</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {RETURN_REASON_OPTIONS.map((option) => (
                  <Button
                    key={option.reason}
                    title={option.label}
                    variant={line.reason === option.reason ? 'pine' : 'outline'}
                    onPress={() => onReason(index, option.reason)}
                    disabled={locked}
                  />
                ))}
              </View>
              {line.photoUri ? (
                <Image
                  source={{ uri: line.photoUri }}
                  resizeMode="cover"
                  accessibilityLabel={`Photo of the refused ${line.productName}`}
                  style={{ width: '100%', height: 160, borderRadius: radius.md }}
                />
              ) : null}
              <Button
                title={line.photo ? 'Retake photo' : line.asset ? 'Upload photo' : 'Add photo (optional)'}
                variant="outline"
                onPress={() => onPhoto(index)}
                loading={photoBusy === index}
                disabled={locked}
              />
            </>
          ) : null}
        </View>
      ))}

      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.xs }}>
        <AppText variant="small">{prepaid ? 'Refund for what came back' : 'Collect for what they kept'}</AppText>
        <AppText variant="big" style={{ color: colors.pine }}>
          {formatPrice(prepaid ? summary.refundTotal : summary.netTotal)}
        </AppText>
        {summary.returnedTotal > 0 ? (
          <AppText variant="small">
            {formatPrice(summary.returnedTotal)} of goods coming back
            {summary.feeRefunded ? ` · the ${formatPrice(summary.fee)} delivery fee is refunded too` : ''}.
          </AppText>
        ) : null}
        {prepaid ? <AppText variant="small">The customer already paid online.</AppText> : null}
      </View>

      <Button
        title={delivery.paymentOptions?.length > 1 ? 'Continue' : 'Complete delivery'}
        onPress={onContinue}
        loading={busy}
        disabled={!ready || locked}
      />
      <AppText variant="small">
        {ready ? 'The server checks the counts and prices again before anything is charged.' : 'Choose a reason for every refused item.'}
      </AppText>
      <Button title="Back" variant="outline" onPress={onBack} disabled={locked} />
    </Card>
  )
}

function DeliveryDetail({ id }) {
  const remote = useRemote(id, () => fetchDelivery(id))
  // The newest answer from an action (it carries the updated delivery) wins over the loaded one.
  const [latest, setLatest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone, text }
  const [mode, setMode] = useState(null) // null | 'code' | 'items' | 'method' | 'fail'
  const [showMap, setShowMap] = useState(false)
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  const [pay, setPay] = useState(EMPTY_PAYMENT)
  const [proofBusy, setProofBusy] = useState(false)
  // What the customer kept, line by line; null until the review opens.
  const [lines, setLines] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(null) // line index being uploaded

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
      setPay(EMPTY_PAYMENT)
      setLines(null)
      if (success) setNotice({ tone: 'ok', text: success })
    } catch (err) {
      setNotice({ tone: 'error', text: err.codeMessage || getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const move = (status, label) => run(() => setDeliveryStatus(id, status), `Marked as ${label.toLowerCase()}.`)

  const complete = (collection, reviewLines = lines) =>
    run(
      async () => {
        try {
          return await completeDelivery(id, code, collection, linesPayload(reviewLines))
        } catch (err) {
          // Say what happened to the code (tries left, locked) or the return/payment.
          const problem = err?.response?.data?.code
          const codeProblem = CODE_ERRORS.has(problem)
          // A refused code leaves the rider on the code step, so it can be corrected.
          if (codeProblem) {
            setMode('code')
            setLines(null)
          }
          throw Object.assign(err, {
            codeMessage: codeProblem ? codeErrorMessage(err) : RETURN_ERRORS.has(problem) ? returnErrorMessage(err) : proofErrorMessage(err),
          })
        }
      },
      'Delivered. Thank you!',
    )

  const fail = () => run(() => setDeliveryStatus(id, 'FAILED', reason.trim()), 'Marked as not delivered.')

  // The code is checked first; then the rider counts what the customer kept.
  function startReview() {
    setNotice(null)
    const next = acceptanceFrom(delivery)
    if (!next.length) {
      if (paymentMethodsFor(delivery).length > 1) setMode('method')
      else complete(undefined, [])
      return
    }
    setLines(next)
    setMode('items')
  }

  const changeLine = (index, update) => setLines((current) => current.map((line, i) => (i === index ? update(line) : line)))
  const acceptLine = (index, acceptedQty) => changeLine(index, (line) => setAcceptedQty(line, acceptedQty))
  const setLineReason = (index, next) => changeLine(index, (line) => ({ ...line, reason: next }))

  // Past the code, a refused line needs a reason; the photo is optional. It goes
  // to the delivery's private folder, never to another delivery's.
  async function captureReturnPhoto(index) {
    if (photoBusy !== null || busy) return
    setNotice(null)

    const line = lines?.[index]
    if (!line) return

    // A photo picked earlier but not stored yet is retried as-is.
    let asset = line.photo ? null : line.asset
    if (!asset) {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) {
          setNotice({ tone: 'error', text: 'Allow the camera to photograph the refused item.' })
          return
        }
        const shot = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          cameraType: ImagePicker.CameraType.back,
          quality: 0.4,
          exif: false,
          allowsEditing: false,
        })
        if (shot.canceled || !shot.assets?.length) return
        asset = shot.assets[0]
      } catch {
        setNotice({ tone: 'error', text: 'Could not open the camera. Try again.' })
        return
      }
      changeLine(index, (l) => ({ ...l, photo: null, photoUri: asset.uri, asset }))
    }

    setPhotoBusy(index)
    try {
      const upload = await requestReturnUpload(id)
      const photo = await uploadReturnPhoto(upload, asset)
      changeLine(index, (l) => ({ ...l, photo }))
    } catch (err) {
      if (err?.message === 'PROOF_FILE_MISSING') changeLine(index, (l) => ({ ...l, photo: null, photoUri: null, asset: null }))
      setNotice({ tone: 'error', text: returnErrorMessage(err) })
    } finally {
      setPhotoBusy(null)
    }
  }

  // A photo of the confirmation or the machine slip — never the card. Taken with
  // the camera only, at reduced quality, with no EXIF (so no location), and it
  // goes straight to the delivery's private Cloudinary folder.
  async function captureProof() {
    if (proofBusy || busy) return
    setNotice(null)

    // A photo picked earlier but not stored yet (its upload failed) is retried
    // as-is, so the rider does not have to walk back and take it again.
    let asset = pay.proof ? null : pay.asset
    if (!asset) {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) {
          setNotice({ tone: 'error', text: 'Allow the camera to photograph the payment confirmation.' })
          return
        }
        const shot = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          cameraType: ImagePicker.CameraType.back,
          quality: 0.4,
          exif: false,
          allowsEditing: false,
        })
        if (shot.canceled || !shot.assets?.length) return
        asset = shot.assets[0]
      } catch {
        setNotice({ tone: 'error', text: 'Could not open the camera. Try again.' })
        return
      }
      // Show the photo at once; it counts as proof only after it is uploaded.
      setPay((p) => ({ ...p, proof: null, photo: asset.uri, asset }))
    }

    setProofBusy(true)
    try {
      const upload = await requestProofUpload(id)
      const proof = await uploadPaymentProof(upload, asset)
      setPay((p) => ({ ...p, proof }))
    } catch (err) {
      // The picked file is gone: the next tap should open the camera, not retry it.
      if (err?.message === 'PROOF_FILE_MISSING') setPay((p) => ({ ...p, photo: null, asset: null }))
      setNotice({ tone: 'error', text: proofErrorMessage(err) })
    } finally {
      setProofBusy(false)
    }
  }

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
    // The customer's checkout pin; the server stops sending it once the job is closed.
    const pin = delivery.deliveryLocation
    // The server decides what may be offered; without Cloudinary that is cash only.
    const paymentMethods = paymentMethodsFor(delivery)
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
              {pin || map ? (
                <Button
                  title={pin ? (showMap ? 'Hide map' : 'Open in map') : 'Open in Maps'}
                  variant="outline"
                  onPress={() => (pin ? setShowMap((shown) => !shown) : open(map))}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
            {pin && showMap ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <DestinationMap point={pin} label={`delivery to ${delivery.address.city || 'the customer'}`} />
                <Button title="Navigate" variant="outline" onPress={() => open(locationMapUrl(pin))} />
              </View>
            ) : null}
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
          ) : cash.kind === 'proof' ? (
            <>
              <AppText variant="small">Paid at the door</AppText>
              <AppText variant="strong">{PROOF_STATUS[cash.status] || PROOF_STATUS.SUBMITTED}</AppText>
            </>
          ) : cash.kind === 'prepaid' ? (
            <AppText variant="strong">Already paid online. Collect nothing.</AppText>
          ) : cash.kind === 'collected' ? (
            <AppText variant="strong">Cash collected</AppText>
          ) : (
            <AppText variant="strong">Nothing was collected.</AppText>
          )}
        </Card>

        {delivery.fulfilment ? (
          <Card style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
            <AppText variant="small">What happened at the door</AppText>
            <AppText variant="strong">
              {delivery.fulfilment === 'FULL'
                ? 'Everything was delivered.'
                : delivery.fulfilment === 'NONE'
                  ? 'Everything went back to the store.'
                  : 'Part of the order came back.'}
            </AppText>
            {delivery.returnedAmount > 0 ? (
              <AppText variant="small">
                {formatPrice(delivery.returnedAmount)} of goods came back{delivery.feeRefunded ? ', and the delivery fee was refunded' : ''}.
              </AppText>
            ) : null}
            {delivery.netTotal !== null && delivery.netTotal !== undefined ? (
              <AppText variant="small">
                {delivery.paymentMethod === 'COD' ? 'Collected:' : 'Final total:'} {formatPrice(delivery.netTotal)}
              </AppText>
            ) : null}
          </Card>
        ) : null}

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

            {canComplete(delivery.status) && mode !== 'fail' && mode !== 'method' && mode !== 'items' ? (
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
                    onSubmitEditing={() => isValidCode(code) && startReview()}
                  />
                  <AppText variant="small">Ask the customer for the 6-digit code shown in their app.</AppText>
                  <Button title="Continue" onPress={startReview} disabled={!isValidCode(code)} />
                  <Button title="Cancel" variant="outline" onPress={() => { setMode(null); setCode('') }} disabled={busy} />
                </Card>
              ) : (
                <Button title="Enter code to complete" onPress={() => { setNotice(null); setMode('code') }} disabled={busy} />
              )
            ) : null}

            {canComplete(delivery.status) && mode === 'items' && lines ? (
              <ItemReview
                lines={lines}
                delivery={delivery}
                busy={busy}
                photoBusy={photoBusy}
                onAccepted={acceptLine}
                onReason={setLineReason}
                onPhoto={captureReturnPhoto}
                onContinue={() => (paymentMethods.length > 1 ? setMode('method') : complete(undefined, lines))}
                onBack={() => { setNotice(null); setMode('code') }}
              />
            ) : null}

            {canComplete(delivery.status) && mode === 'method' ? (
              <Card style={{ gap: spacing.md }}>
                <AppText variant="small">How did the customer pay?</AppText>
                <View style={{ gap: spacing.sm }}>
                  {paymentMethods.map((m) => (
                    <Button
                      key={m.method}
                      title={m.label}
                      variant={pay.method === m.method ? 'pine' : 'outline'}
                      onPress={() => setPay((p) => ({ ...p, method: m.method }))}
                      disabled={busy || proofBusy}
                    />
                  ))}
                </View>

                {pay.method && pay.method !== 'CASH' ? (
                  <>
                    <AppText variant="small">
                      Photograph the confirmation or the slip — never the card. Card numbers are never typed or stored.
                    </AppText>

                    {pay.method === 'WALLET' ? (
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        {WALLETS.map((w) => (
                          <Button
                            key={w.wallet}
                            title={w.label}
                            variant={pay.wallet === w.wallet ? 'pine' : 'outline'}
                            onPress={() => setPay((p) => ({ ...p, wallet: w.wallet }))}
                            disabled={busy || proofBusy}
                            style={{ flex: 1 }}
                          />
                        ))}
                      </View>
                    ) : null}

                    <TextField
                      label="Transaction ID or approval code"
                      value={pay.reference}
                      onChangeText={(v) => setPay((p) => ({ ...p, reference: v }))}
                      maxLength={100}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="For example: JC-778812"
                    />

                    {pay.photo ? (
                      <Image
                        source={{ uri: pay.photo }}
                        resizeMode="cover"
                        accessibilityLabel="Payment proof photo"
                        style={{ width: '100%', height: 180, borderRadius: radius.md }}
                      />
                    ) : null}
                    <Button
                      title={pay.proof ? 'Retake photo' : pay.asset ? 'Upload photo' : 'Take photo'}
                      variant="outline"
                      onPress={captureProof}
                      loading={proofBusy}
                      disabled={busy || proofBusy}
                    />
                  </>
                ) : null}

                <Button
                  title="Complete delivery"
                  onPress={() => complete(collectionPayload(pay), lines)}
                  loading={busy}
                  disabled={!collectionReady(pay)}
                />
                <Button
                  title="Back"
                  variant="outline"
                  onPress={() => { setNotice(null); setMode(lines ? 'items' : 'code') }}
                  disabled={busy || proofBusy}
                />
              </Card>
            ) : null}

            {canComplete(delivery.status) && mode !== 'code' && mode !== 'method' ? (
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
