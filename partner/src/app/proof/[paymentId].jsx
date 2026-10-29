import { useState } from 'react'
import { Image, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import RequireRole from '../../components/RequireRole'
import AppText from '../../components/ui/AppText'
import BackButton from '../../components/BackButton'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import TextField from '../../components/ui/TextField'
import { useAuth } from '../../hooks/useAuth'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { decideProof, fetchProofLink } from '../../services/records'
import { formatDateTime, formatPaymentMethod, formatPrice } from '../../utils/format'
import { can } from '../../utils/permissions'
import { colors, radius, spacing } from '../../theme'

function Row({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant="small">{label}</AppText>
      <AppText variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  )
}

function Notice({ tone, children }) {
  const look = tone === 'error' ? { bg: colors.dangerSoft, fg: colors.danger } : { bg: colors.successSoft, fg: colors.success }
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: look.bg, borderRadius: radius.md, padding: spacing.md }}>
      <AppText variant="small" style={{ color: look.fg }}>
        {children}
      </AppText>
    </View>
  )
}

// One non-cash payment's photo and reference, checked against the brand's own
// statement (docs/21 §I.3). Verifying or rejecting is the records person's call;
// nothing about the money moves automatically. The photo link expires in minutes.
function ProofDetail({ paymentId }) {
  const { user } = useAuth()
  const remote = useRemote(`proof:${paymentId}`, () => fetchProofLink(paymentId))
  const proof = remote.data
  const canDecide = can(user, 'payments.manage')

  const [photoFailed, setPhotoFailed] = useState(false)
  const [mode, setMode] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  async function decide(verification) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      await decideProof(paymentId, verification, verification === 'REJECTED' ? reason.trim() : undefined)
      setNotice({
        tone: 'success',
        text: verification === 'VERIFIED' ? 'Marked as verified. The money is checked.' : 'Rejected. The brand owner has been told to look into it.',
      })
    } catch (err) {
      const code = err.response?.data?.code
      const text =
        code === 'PROOF_ALREADY_DECIDED'
          ? 'Someone else already checked this payment. The screen now shows their decision.'
          : getErrorMessage(err)
      setNotice({ tone: 'error', text })
    } finally {
      setMode(null)
      setReason('')
      setBusy(false)
      remote.reload()
    }
  }

  function showPhotoAgain() {
    setPhotoFailed(false)
    remote.reload()
  }

  let body
  if (remote.status === 'loading') {
    body = <Skeleton height={280} />
  } else if (remote.status === 'error') {
    const missing = remote.httpStatus === 404
    body = (
      <EmptyState
        icon={missing ? 'camera-off' : 'wifi-off'}
        tone={missing ? undefined : 'error'}
        title={missing ? 'No photo here' : "Couldn't load this payment"}
        message={missing ? 'It may have been deleted after checking, or the payment is not yours to see.' : remote.error}
        action={missing ? null : <Button title="Try again" onPress={remote.reload} />}
      />
    )
  } else {
    const duplicates = [
      proof.duplicateReference ? 'The same reference was used on another payment.' : '',
      proof.duplicateProof ? 'The same photo was used on another payment.' : '',
    ].filter(Boolean)

    body = (
      <View style={{ gap: spacing.lg }}>
        {mode === 'verify' ? (
          <Card style={{ gap: spacing.md }}>
            <AppText variant="strong">Mark {formatPrice(proof.amount)} as verified?</AppText>
            <AppText variant="small">Only do this once you can see the money in the brand&apos;s account or statement.</AppText>
            <Button title="Yes, verified" onPress={() => decide('VERIFIED')} loading={busy} />
            <Button title="Cancel" variant="outline" onPress={() => setMode(null)} disabled={busy} />
          </Card>
        ) : null}

        {mode === 'reject' ? (
          <Card style={{ gap: spacing.md }}>
            <AppText variant="strong">Reject this payment?</AppText>
            <AppText variant="small">The brand owner is told, and the money is not changed automatically.</AppText>
            <TextField label="Why is it rejected?" value={reason} onChangeText={setReason} maxLength={300} placeholder="For example: no such transfer on the statement" />
            <Button title="Reject payment" variant="danger" onPress={() => decide('REJECTED')} disabled={!reason.trim()} loading={busy} />
            <Button title="Cancel" variant="outline" onPress={() => setMode(null)} disabled={busy} />
          </Card>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="small">Photo taken at the door</AppText>
          {photoFailed ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="small">The photo link has expired. Links only work for a few minutes.</AppText>
              <Button title="Show photo again" variant="outline" onPress={showPhotoAgain} />
            </View>
          ) : (
            <Image
              source={{ uri: proof.url }}
              onError={() => setPhotoFailed(true)}
              accessibilityLabel={`Payment proof for ${proof.orderNumber || 'this order'}`}
              resizeMode="contain"
              style={{ width: '100%', height: 300, borderRadius: radius.md, backgroundColor: colors.sand }}
            />
          )}
          <AppText variant="small">This private link stops working in a few minutes and only your brand can open it.</AppText>
        </Card>

        {(duplicates.length > 0 || proof.verification !== 'SUBMITTED') && (
          <Card style={{ gap: spacing.xs }}>
            {duplicates.map((line) => (
              <AppText key={line} variant="small" style={{ color: colors.warning }}>
                {line}
              </AppText>
            ))}
            {proof.verification === 'VERIFIED' ? (
              <AppText variant="small" style={{ color: colors.success }}>
                Verified {formatDateTime(proof.verifiedAt)}.
              </AppText>
            ) : null}
            {proof.verification === 'REJECTED' ? (
              <AppText variant="small" style={{ color: colors.danger }}>
                Rejected {formatDateTime(proof.verifiedAt)}. {proof.note || ''}
              </AppText>
            ) : null}
          </Card>
        )}

        <Card style={{ gap: spacing.sm }}>
          <Row label="Order" value={proof.orderNumber || 'Order'} />
          <Row label="Amount" value={formatPrice(proof.amount)} />
          <Row label="Method" value={formatPaymentMethod(proof.method, proof.wallet)} />
          <Row label="Reference" value={proof.reference} />
          <Row label="Taken" value={formatDateTime(proof.submittedAt)} />
        </Card>

        {proof.verification === 'SUBMITTED' ? (
          canDecide ? (
            mode === null ? (
              <View style={{ gap: spacing.sm }}>
                <Button title="Verify payment" onPress={() => setMode('verify')} />
                <Button title="Reject payment" variant="danger" onPress={() => setMode('reject')} />
              </View>
            ) : null
          ) : (
            <AppText variant="small">Only team members who manage payments can verify or reject this.</AppText>
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
              {proof?.orderNumber || 'Payment proof'}
            </AppText>
          </View>
        </View>
        {notice ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </View>
        ) : null}
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function ProofScreen() {
  const { paymentId } = useLocalSearchParams()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <ProofDetail paymentId={String(paymentId)} />
    </RequireRole>
  )
}
