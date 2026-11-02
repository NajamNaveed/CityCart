import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
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
import {
  claimPickOrder,
  fetchPickOrder,
  packPickOrder,
  proposePickChange,
  searchPickProducts,
  setPickLine,
} from '../../services/picker'
import { formatDateTime } from '../../utils/format'
import { colors, radius, spacing } from '../../theme'

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

function LineCard({ item, editable, busy, onMark, shortFor, shortQty, setShortQty, openShort, closeShort }) {
  const chosen = (status) => item.pickStatus === status
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="strong">{item.productName}</AppText>
          <AppText variant="small">
            {item.sku ? `SKU ${item.sku} · ` : ''}
            {item.quantity} ordered
          </AppText>
        </View>
        <StatusPill value={item.pickStatus || 'NOT_CHECKED'} />
      </View>

      {item.pickStatus === 'SHORT' ? (
        <AppText variant="small">Found {item.pickedQty} of {item.quantity}.</AppText>
      ) : item.pickStatus === 'UNAVAILABLE' ? (
        <AppText variant="small">None found.</AppText>
      ) : null}

      {editable ? (
        shortFor === item._id ? (
          <View style={{ gap: spacing.sm }}>
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
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title="Picked" variant={chosen('PICKED') ? 'pine' : 'outline'} onPress={() => onMark(item, 'PICKED')} disabled={busy} style={{ flex: 1, paddingHorizontal: spacing.xs }} />
            {item.quantity > 1 ? (
              <Button title="Short" variant={chosen('SHORT') ? 'pine' : 'outline'} onPress={() => openShort(item)} disabled={busy} style={{ flex: 1, paddingHorizontal: spacing.xs }} />
            ) : null}
            <Button title="Unavailable" variant={chosen('UNAVAILABLE') ? 'pine' : 'outline'} onPress={() => onMark(item, 'UNAVAILABLE')} disabled={busy} style={{ flex: 1, paddingHorizontal: spacing.xs }} />
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

    body = (
      <>
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <Card style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
            <AppText variant="small">Placed {formatDateTime(order.createdAt)}</AppText>
            <AppText variant="small">{order.customerFirstName}</AppText>
          </View>
          <AppText variant="strong">
            {order.items.length} {order.items.length === 1 ? 'line' : 'lines'} to pick
          </AppText>
          <AppText variant="small">No prices or customer contact details are shown to pickers.</AppText>
        </Card>

        {!claimed ? (
          <Card style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            <AppText variant="strong">Waiting to be picked</AppText>
            <AppText variant="small">Take this order to mark what you find. Only you will be able to change its lines.</AppText>
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
          {order.items.map((item) => (
            <LineCard
              key={item._id}
              item={item}
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
                They can accept what you found, keep only that much, or cancel. Offer a substitute from your own store if
                you have one.
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
                          <AppText variant="label">{product.name}</AppText>
                          <AppText variant="small">
                            {product.sku ? `SKU ${product.sku} · ` : ''}Send {shortfall(item)} instead
                          </AppText>
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
              <AppText variant="small">
                {shortLines.length > 0
                  ? 'Some lines are short. Ask the customer what to do before packing.'
                  : 'If something is short, mark it, then ask the customer.'}
              </AppText>
              <Button
                title="Send change proposal"
                variant="outline"
                onPress={() => {
                  setNotice(null)
                  setProposeOpen(true)
                }}
                disabled={busy || shortLines.length === 0 || !allMarked}
              />
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
              {!allPicked ? <AppText variant="small">Every line must be picked in full before packing.</AppText> : null}
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
