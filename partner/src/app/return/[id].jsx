import { useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native'
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
import StatusPill from '../../components/StatusPill'
import { useAuth } from '../../hooks/useAuth'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import { fetchReturn, fetchReturnPhotoLink, receiveReturn } from '../../services/records'
import { isReturnOpen, reasonLabel, receiveDecisions, returnSummaryLine } from '../../utils/delivery'
import { formatDateTime, formatPrice } from '../../utils/format'
import { can } from '../../utils/permissions'
import { colors, minTouch, radius, spacing } from '../../theme'

function Notice({ tone, children }) {
  const look = tone === 'ok' ? { bg: colors.successSoft, fg: colors.success } : { bg: colors.dangerSoft, fg: colors.danger }
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: look.bg, borderRadius: radius.md, padding: spacing.md }}>
      <AppText variant="small" style={{ color: look.fg }}>
        {children}
      </AppText>
    </View>
  )
}

// The store's decision for one line: sellable (restock) or written off. The
// default is write off, so a quick tap can never add unsellable goods to stock.
function RestockChoice({ line, checked, disabled, onToggle }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`Restock ${line.productName}`}
      style={({ pressed }) => ({
        minHeight: minTouch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: checked ? colors.pine : colors.line,
        backgroundColor: checked ? colors.pineSoft : pressed ? colors.sand : colors.surface,
      })}
    >
      <Feather name={checked ? 'check-square' : 'square'} size={18} color={checked ? colors.pine : colors.muted} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{checked ? 'Sellable: back on the shelf' : 'Write off'}</AppText>
        <AppText variant="small">{checked ? 'Stock will increase by this many units.' : 'Not sellable: stock stays as it is.'}</AppText>
      </View>
    </Pressable>
  )
}

function ReturnDetail({ id, orderNumber }) {
  const { user } = useAuth()
  const remote = useRemote(`return:${id}`, () => fetchReturn(id))
  const [latest, setLatest] = useState(null)
  const [restock, setRestock] = useState({})
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(null)
  const [notice, setNotice] = useState(null) // { ok, text }

  const ret = latest || remote.data
  const open = isReturnOpen(ret?.status)
  const canReceive = can(user, 'delivery.manage')

  async function showPhoto(index) {
    if (photoBusy !== null) return
    setPhotoBusy(index)
    setNotice(null)
    try {
      const link = await fetchReturnPhotoLink(id, index)
      await Linking.openURL(link.url)
    } catch (err) {
      setNotice({ ok: false, text: getErrorMessage(err) })
    } finally {
      setPhotoBusy(null)
    }
  }

  async function receive() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const updated = await receiveReturn(id, receiveDecisions(ret.lines, restock))
      setLatest(updated)
      const sellable = ret.lines.filter((_, index) => restock[index]).length
      setNotice({
        ok: true,
        text: sellable
          ? `Received. ${sellable} ${sellable === 1 ? 'line is' : 'lines are'} back on the shelf.`
          : 'Received. Everything was written off.',
      })
      setRestock({})
    } catch (err) {
      setNotice({ ok: false, text: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  let body
  if (!ret && remote.status === 'loading') {
    body = (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={120} />
        <Skeleton height={100} />
      </View>
    )
  } else if (!ret) {
    body = (
      <EmptyState
        icon="alert-circle"
        tone="error"
        title={remote.httpStatus === 404 ? 'Return not found' : "Couldn't load this return"}
        message={remote.error}
        action={remote.httpStatus === 404 ? null : <Button title="Try again" onPress={remote.reload} />}
      />
    )
  } else {
    body = (
      <View style={{ gap: spacing.lg }}>
        {notice ? <Notice tone={notice.ok ? 'ok' : 'error'}>{notice.text}</Notice> : null}

        <Card style={{ gap: spacing.xs }}>
          <AppText variant="small">{returnSummaryLine(ret)}</AppText>
          <AppText variant="strong">{formatPrice(ret.returnedSubtotal)} of goods</AppText>
          {ret.feeRefunded ? <AppText variant="small">The delivery fee was refunded to the customer.</AppText> : null}
          {ret.refundAmount > 0 ? <AppText variant="small">Refunded to the customer: {formatPrice(ret.refundAmount)}</AppText> : null}
          {ret.receivedAt ? <AppText variant="small">Received {formatDateTime(ret.receivedAt)}</AppText> : null}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <AppText variant="small">What came back</AppText>
          {ret.lines.map((line, index) => (
            <View
              key={line.orderItemId || index}
              style={{
                gap: spacing.sm,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
                paddingTop: index ? spacing.md : 0,
              }}
            >
              <View style={{ gap: 2 }}>
                <AppText variant="strong">{line.productName}</AppText>
                <AppText variant="small">
                  {line.quantity} × {formatPrice(line.unitPrice)} · {reasonLabel(line.reason)}
                </AppText>
              </View>

              {line.hasPhoto ? (
                <Button
                  title="View photo"
                  variant="outline"
                  onPress={() => showPhoto(index)}
                  loading={photoBusy === index}
                  disabled={busy || photoBusy !== null}
                />
              ) : null}

              {open && canReceive ? (
                <RestockChoice
                  line={line}
                  checked={Boolean(restock[index])}
                  disabled={busy}
                  onToggle={() => setRestock((current) => ({ ...current, [index]: !current[index] }))}
                />
              ) : !open ? (
                <AppText variant="small">{line.restock ? 'Restocked' : 'Written off'}</AppText>
              ) : null}
            </View>
          ))}
        </Card>

        {open ? (
          canReceive ? (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="small">
                Tick the goods that can be sold again. Everything else is written off. Stock only changes now, when the store takes the goods in.
              </AppText>
              <Button title="Mark received" onPress={receive} loading={busy} disabled={busy || photoBusy !== null} />
              <AppText variant="small">This can only be done once.</AppText>
            </Card>
          ) : (
            <AppText variant="small">You can see this return but cannot take the goods in.</AppText>
          )
        ) : null}
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={remote.refreshing} onRefresh={() => { setLatest(null); remote.reload() }} tintColor={colors.pine} colors={[colors.pine]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" accessibilityRole="header">
              {orderNumber || 'Returned goods'}
            </AppText>
          </View>
          {ret ? <StatusPill value={ret.status} /> : null}
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function ReturnScreen() {
  const { id, orderNumber } = useLocalSearchParams()
  return (
    <RequireRole role="BRAND_EMPLOYEE">
      <ReturnDetail id={String(id)} orderNumber={typeof orderNumber === 'string' ? orderNumber : ''} />
    </RequireRole>
  )
}
