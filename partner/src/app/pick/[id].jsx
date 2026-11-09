import { useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
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
import TextField from '../../components/ui/TextField'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import {
  claimPickOrder,
  fetchPickOrder,
  packPickOrder,
  proposePickChange,
  searchPickProducts,
  setPickLine,
} from '../../services/picker'
import { formatDateTime } from '../../utils/format'
import { colors, radius, spacing, weights } from '../../theme'

const PICK_LOOK = {
  PICKED: 'Picked in full',
  SHORT: 'Some units found',
  UNAVAILABLE: 'Not on the shelf',
}

const STALE_CODES = new Set(['PICK_TAKEN', 'ORDER_CHANGED', 'NOT_PICKING', 'NOT_YOUR_ORDER', 'ADJUSTMENT_PENDING'])

const isShort = (item) => item.pickStatus === 'SHORT' || item.pickStatus === 'UNAVAILABLE'
const shortfall = (item) => Math.max(0, item.quantity - (item.pickedQty || 0))

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

// One answer to "how much of this line did you find?" A full-width row with an
// icon and a plain-words description, so the choices never squeeze on a phone.
function ChoiceRow({ icon, title, description, selected, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 52,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: selected ? colors.pine : colors.line,
        backgroundColor: selected ? colors.pineSoft : pressed ? colors.sand : colors.surface,
      })}
    >
      <Feather name={selected ? 'check-circle' : icon} size={20} color={selected ? colors.pine : colors.ink} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{title}</AppText>
        {description ? <AppText variant="small">{description}</AppText> : null}
      </View>
    </Pressable>
  )
}

// The product's own photo, so the picker can match it on the shelf without
// reading every name. A brand with no photo gets a neutral placeholder.
function Thumb({ uri, name, size = 48 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? (
        <Image source={{ uri }} accessibilityLabel={`Photo of ${name}`} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      ) : (
        <Feather name="package" size={Math.round(size / 2.5)} color={colors.muted} />
      )}
    </View>
  )
}

function LineCard({ item, index, editable, busy, onMark, shortFor, shortQty, setShortQty, openShort, closeShort }) {
  const checked = Boolean(item.pickStatus)
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <Thumb uri={item.image} name={item.productName} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="strong">{item.productName}</AppText>
          <AppText variant="small">
            {item.sku ? `SKU ${item.sku} · ` : ''}
            {item.quantity} ordered
          </AppText>
          <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
            <StatusPill value={item.pickStatus || 'NOT_CHECKED'} />
          </View>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            marginTop: 2,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: checked ? colors.pine : colors.line,
            backgroundColor: checked ? colors.pineSoft : colors.surface,
          }}
        >
          <AppText variant="small" style={{ color: checked ? colors.pine : colors.muted, fontWeight: weights.semibold }}>
            {index}
          </AppText>
        </View>
      </View>

      {item.pickStatus === 'SHORT' ? (
        <AppText variant="small" style={{ color: colors.warning }}>
          Found {item.pickedQty} of {item.quantity} — {shortfall(item)} short.
        </AppText>
      ) : item.pickStatus === 'UNAVAILABLE' ? (
        <AppText variant="small" style={{ color: colors.danger }}>
          None found on the shelf.
        </AppText>
      ) : item.pickStatus === 'PICKED' ? (
        <AppText variant="small" style={{ color: colors.success }}>
          All {item.quantity} found.
        </AppText>
      ) : null}

      {editable ? (
        shortFor === item._id ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label">How many did you find?</AppText>
            <TextField
              label="Units found"
              value={shortQty}
              onChangeText={(value) => setShortQty(value.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder={`1 to ${item.quantity - 1}`}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button title="Save short pick" onPress={() => onMark(item, 'SHORT', Number(shortQty))} disabled={busy} style={{ flex: 1, paddingHorizontal: spacing.sm }} />
              <Button title="Cancel" variant="outline" onPress={closeShort} disabled={busy} style={{ flex: 1, paddingHorizontal: spacing.sm }} />
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <ChoiceRow icon="check" title="Picked" description={`Found all ${item.quantity}`} selected={item.pickStatus === 'PICKED'} onPress={() => onMark(item, 'PICKED')} disabled={busy} />
            {item.quantity > 1 ? (
              <ChoiceRow icon="minus-circle" title="Short" description="Found fewer than ordered" selected={item.pickStatus === 'SHORT'} onPress={() => openShort(item)} disabled={busy} />
            ) : null}
            <ChoiceRow icon="x-circle" title="Unavailable" description="None on the shelf" selected={item.pickStatus === 'UNAVAILABLE'} onPress={() => onMark(item, 'UNAVAILABLE')} disabled={busy} />
          </View>
        )
      ) : null}
    </Card>
  )
}

function PickDetail({ id }) {
  const router = useRouter()
  const remote = useRemote(`pick:${id}`, () => fetchPickOrder(id))
  const [latest, setLatest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone, text }
  const [shortFor, setShortFor] = useState(null)
  const [shortQty, setShortQty] = useState('')
  const [proposeOpen, setProposeOpen] = useState(false)
  const [note, setNote] = useState('')
  const [subs, setSubs] = useState({}) // itemId -> { productId, name, quantity }
  const [search, setSearch] = useState({ itemId: null, q: '', products: [], loading: false, error: '', done: false })
  const [confirmPack, setConfirmPack] = useState(false)

  const order = latest || remote.data

  function reload() {
    setLatest(null)
    remote.reload()
  }

  async function run(action, success) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      setLatest(await action())
      setShortFor(null)
      setShortQty('')
      if (success) setNotice({ tone: 'ok', text: success })
    } catch (err) {
      setNotice({ tone: 'error', text: getErrorMessage(err) })
      // Someone else moved the order, or a proposal is now waiting: show the truth.
      if (STALE_CODES.has(err?.response?.data?.code)) reload()
    } finally {
      setBusy(false)
    }
  }

  const mark = (item, pickStatus, pickedQty) =>
    run(
      () => setPickLine(id, item._id, pickStatus, pickedQty),
      `${item.productName}: ${PICK_LOOK[pickStatus].toLowerCase()}.`,
    )

  function openShort(item) {
    setNotice(null)
    setShortFor(item._id)
    setShortQty(String(Math.max(1, item.quantity - 1)))
  }

  function openSearch(itemId) {
    setSearch({ itemId, q: '', products: [], loading: false, error: '', done: false })
  }

  async function runSearch() {
    setSearch((s) => ({ ...s, loading: true, error: '', done: false }))
    try {
      const products = await searchPickProducts(search.q.trim())
      setSearch((s) => ({ ...s, products, loading: false, done: true }))
    } catch (err) {
      setSearch((s) => ({ ...s, loading: false, error: getErrorMessage(err) }))
    }
  }

  function chooseSubstitute(item, product) {
    setSubs((current) => ({
      ...current,
      [item._id]: { productId: product._id, name: product.name, quantity: shortfall(item) },
    }))
    setSearch({ itemId: null, q: '', products: [], loading: false, error: '', done: false })
  }

  function removeSubstitute(itemId) {
    setSubs((current) => {
      const next = { ...current }
      delete next[itemId]
      return next
    })
  }

  async function sendProposal() {
    if (busy) return
    const shortLines = order.items.filter(isShort)
    if (note.trim().length < 3 || shortLines.length === 0) return
    setBusy(true)
    setNotice(null)
    try {
      await proposePickChange(id, {
        note: note.trim(),
        substitutes: shortLines
          .filter((item) => subs[item._id])
          .map((item) => ({
            orderItemId: item._id,
            productId: subs[item._id].productId,
            quantity: subs[item._id].quantity,
          })),
      })
      setProposeOpen(false)
      setNote('')
      setSubs({})
      setSearch({ itemId: null, q: '', products: [], loading: false, error: '', done: false })
      setNotice({ tone: 'ok', text: 'The customer has been asked to answer. The lines are locked until they do.' })
      reload()
    } catch (err) {
      setNotice({ tone: 'error', text: getErrorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const pack = () => run(() => packPickOrder(id), 'Packed. This order is now ready for a rider.')

  let body
  if (!order && remote.status === 'loading') {
    body = (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={110} />
        <Skeleton height={150} />
        <Skeleton height={150} />
      </View>
    )
  } else if (!order) {
    body = (
      <EmptyState
        icon="alert-circle"
        tone="error"
        title={remote.httpStatus === 404 ? 'Order not found' : "Couldn't load this order"}
        message={remote.httpStatus === 404 ? 'It may be someone else’s order or no longer waiting to be picked.' : remote.error}
        action={remote.httpStatus === 404 ? null : <Button title="Try again" onPress={reload} />}
      />
    )
  } else {
    const claimed = order.claimedByMe
    const picking = claimed && order.orderStatus === 'PROCESSING'
    const active = order.activeAdjustment
    const editable = picking && !active && !busy
    const shortLines = order.items.filter(isShort)
    const allMarked = order.items.every((item) => Boolean(item.pickStatus))
    const allPicked = order.items.every((item) => item.pickStatus === 'PICKED')
    const canSend = shortLines.length > 0 && allMarked && note.trim().length >= 3
    const checkedCount = order.items.filter((item) => Boolean(item.pickStatus)).length

    body = (
      <>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
            <AppText variant="small" style={{ flex: 1 }}>
              Placed {formatDateTime(order.createdAt)}
            </AppText>
            <AppText variant="small" style={{ flexShrink: 1, textAlign: 'right' }}>
              For {order.customerFirstName}
            </AppText>
          </View>
          <AppText variant="strong">
            Pick {order.items.length} {order.items.length === 1 ? 'line' : 'lines'}
          </AppText>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: colors.sand, overflow: 'hidden' }}>
            {checkedCount > 0 ? <View style={{ flex: checkedCount, backgroundColor: colors.pine }} /> : null}
            {checkedCount < order.items.length ? <View style={{ flex: order.items.length - checkedCount }} /> : null}
          </View>
          <AppText variant="small">
            {checkedCount} of {order.items.length} {order.items.length === 1 ? 'line' : 'lines'} checked
            {shortLines.length > 0 ? ` · ${shortLines.length} short` : ''}
          </AppText>
          <AppText variant="small" style={{ marginTop: spacing.xs }}>
            You see items and quantities only — never prices or the customer&apos;s contact details.
          </AppText>
        </Card>

        {!claimed ? (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            <AppText variant="strong">Waiting to be picked</AppText>
            <AppText variant="small">Take this order to mark what you find. While it is yours, no other picker can change it.</AppText>
            <Button title="Claim this order" onPress={() => run(() => claimPickOrder(id), 'This order is yours. Pick every line.')} loading={busy} />
          </Card>
        ) : null}

        {active ? (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.lg, borderColor: colors.warning, backgroundColor: colors.warningSoft }}>
            <AppText variant="strong">Waiting for the customer</AppText>
            <AppText variant="small">{active.note}</AppText>
            <AppText variant="small">
              {active.proposedByRole === 'PICKER' ? 'Suggested by you' : 'Suggested by the brand'} · expires{' '}
              {formatDateTime(active.expiresAt)}
            </AppText>
            <Button title="Check again" variant="outline" onPress={reload} disabled={busy} />
          </Card>
        ) : null}

        {order.orderStatus === 'READY_FOR_SHIPMENT' ? (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            <AppText variant="strong">Packed and ready for a rider</AppText>
            <AppText variant="small">Packed {formatDateTime(order.packedAt)}.</AppText>
            <Button title="Back to the queue" variant="outline" onPress={() => router.back()} />
          </Card>
        ) : claimed && !picking ? (
          <Card style={{ marginBottom: spacing.lg }}>
            <AppText variant="small">This order is no longer being picked.</AppText>
          </Card>
        ) : null}

        <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
          {order.items.map((item, index) => (
            <LineCard
              key={item._id}
              item={item}
              index={index + 1}
              editable={editable}
              busy={busy}
              onMark={mark}
              shortFor={shortFor}
              shortQty={shortQty}
              setShortQty={setShortQty}
              openShort={openShort}
              closeShort={() => setShortFor(null)}
            />
          ))}
        </View>

        {picking && !active ? (
          proposeOpen ? (
            <Card style={{ gap: spacing.md, marginBottom: spacing.lg }}>
              <AppText variant="strong">Ask the customer about the short lines</AppText>
              <AppText variant="small">
                For each line below, say what you found and offer a substitute from this store if you have one. The
                customer decides — the lines stay locked until they answer.
              </AppText>

              {shortLines.map((item) => (
                <View key={item._id} style={{ gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <AppText variant="label">{item.productName}</AppText>
                  <AppText variant="small">
                    {item.pickStatus === 'UNAVAILABLE' ? 'None found' : `Found ${item.pickedQty} of ${item.quantity}`} ·{' '}
                    {shortfall(item)} short
                  </AppText>

                  {subs[item._id] ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                      <AppText variant="small" style={{ flex: 1, color: colors.ink }}>
                        Instead: {subs[item._id].quantity} × {subs[item._id].name}
                      </AppText>
                      <Button title="Remove substitute" variant="outline" onPress={() => removeSubstitute(item._id)} disabled={busy} style={{ paddingHorizontal: spacing.md }} />
                    </View>
                  ) : search.itemId === item._id ? (
                    <View style={{ gap: spacing.sm }}>
                      <TextField
                        label="Find a product"
                        value={search.q}
                        onChangeText={(q) => setSearch((s) => ({ ...s, q }))}
                        placeholder="Type a product name"
                        autoCorrect={false}
                      />
                      <Button title="Search" onPress={runSearch} loading={search.loading} disabled={busy} />
                      {search.error ? (
                        <AppText variant="small" style={{ color: colors.danger }}>
                          {search.error}
                        </AppText>
                      ) : null}
                      {search.products.map((product) => (
                        <Pressable
                          key={product._id}
                          onPress={() => chooseSubstitute(item, product)}
                          accessibilityRole="button"
                          accessibilityLabel={`Use ${product.name}`}
                          style={({ pressed }) => ({ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.sand : colors.surface })}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                            <Thumb uri={product.image} name={product.name} size={40} />
                            <View style={{ flex: 1 }}>
                              <AppText variant="label">{product.name}</AppText>
                              <AppText variant="small">
                                {product.sku ? `SKU ${product.sku} · ` : ''}Send {shortfall(item)} instead
                              </AppText>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                      {search.done && search.products.length === 0 ? (
                        <AppText variant="small">No products match. Try another name.</AppText>
                      ) : null}
                      <Button title="Cancel search" variant="outline" onPress={() => openSearch(null)} disabled={busy} />
                    </View>
                  ) : (
                    <Button title="Offer a substitute" variant="outline" onPress={() => openSearch(item._id)} disabled={busy} />
                  )}
                </View>
              ))}

              {shortLines.length === 0 ? (
                <AppText variant="small">Mark at least one line as short or unavailable first.</AppText>
              ) : null}

              <TextField
                label="Message to the customer"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                placeholder="For example: only 3 of the 5 were on the shelf."
              />
              {!allMarked ? <AppText variant="small">Mark every line before sending, so nothing is left unchecked.</AppText> : null}

              <Button title="Send proposal" onPress={sendProposal} loading={busy} disabled={!canSend} />
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setProposeOpen(false)
                  setNote('')
                  setSubs({})
                  setSearch({ itemId: null, q: '', products: [], loading: false, error: '', done: false })
                }}
                disabled={busy}
              />
            </Card>
          ) : (
            <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
              {shortLines.length > 0 ? (
                <Card style={{ gap: spacing.xs, borderColor: colors.warning, backgroundColor: colors.warningSoft }}>
                  <AppText variant="strong" style={{ color: colors.warning }}>
                    {shortLines.length} {shortLines.length === 1 ? 'line is short' : 'lines are short'}
                  </AppText>
                  <AppText variant="small" style={{ color: colors.warning }}>
                    Ask the customer before packing: they can accept what you found, take a substitute from this store, or cancel.
                  </AppText>
                </Card>
              ) : null}

              {confirmPack ? (
                <Card style={{ gap: spacing.md }}>
                  <AppText variant="strong">Ready for a rider?</AppText>
                  <AppText variant="small">Pack the items and mark this order ready. A rider can then take it.</AppText>
                  <Button title="Yes, packed" onPress={pack} loading={busy} />
                  <Button title="Not yet" variant="outline" onPress={() => setConfirmPack(false)} disabled={busy} />
                </Card>
              ) : (
                <Button title="Pack order" onPress={() => setConfirmPack(true)} disabled={busy || !allPicked} />
              )}
              {!allPicked ? (
                <AppText variant="small" style={{ textAlign: 'center' }}>
                  Every line must be picked in full before packing.
                </AppText>
              ) : null}

              <Button
                title="Send change proposal"
                variant="outline"
                onPress={() => {
                  setNotice(null)
                  setProposeOpen(true)
                }}
                disabled={busy || shortLines.length === 0 || !allMarked}
              />
              {shortLines.length === 0 ? (
                <AppText variant="small" style={{ textAlign: 'center' }}>
                  If something is missing, mark that line short or unavailable first.
                </AppText>
              ) : null}
            </View>
          )
        ) : null}
      </>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={remote.refreshing} onRefresh={reload} tintColor={colors.pine} colors={[colors.pine]} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <BackButton />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" accessibilityRole="header">
              {order?.orderNumber || 'Order'}
            </AppText>
          </View>
          {order ? <StatusPill value={order.orderStatus} /> : null}
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  )
}

export default function PickScreen() {
  const { id } = useLocalSearchParams()
  return (
    <RequireRole role="PICKER">
      <PickDetail id={String(id)} />
    </RequireRole>
  )
}
