import { useState } from 'react'
import { Alert, Pressable, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Skeleton from '../../components/ui/Skeleton'
import TextField from '../../components/ui/TextField'
import BackButton from '../../components/BackButton'
import ProductImage from '../../components/ProductImage'
import RequireCustomer from '../../components/RequireCustomer'
import Stars from '../../components/Stars'
import StatusPill from '../../components/StatusPill'
import { useRemote } from '../../hooks/useRemote'
import { getErrorMessage } from '../../services/api'
import {
  answerProposal,
  bookingWhen,
  canCancel,
  cancelBooking,
  confirmBooking,
  disputeBooking,
  eventDetail,
  eventLabel,
  fetchBooking,
  postBookingReview,
  priceOf,
} from '../../services/bookings'
import { formatPrice, humanize } from '../../utils/format'
import { durationLabel, formatKarachiDateTime } from '../../utils/serviceSlots'
import { colors, radius, spacing } from '../../theme'

const eyebrowStyle = { fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }

function Section({ eyebrow: label, title, children }) {
  return (
    <Card style={{ gap: spacing.md }}>
      <View>
        {label ? (
          <AppText variant="small" style={eyebrowStyle}>
            {label}
          </AppText>
        ) : null}
        <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 20, lineHeight: 26 }}>
          {title}
        </AppText>
      </View>
      {children}
    </Card>
  )
}

function DetailRow({ label, value }) {
  return (
    <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
      <AppText variant="small" style={eyebrowStyle}>
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  )
}

function StatusMessage({ booking }) {
  if (booking.status === 'REQUESTED') {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        Your request for {formatKarachiDateTime(booking.requestedStart)} has been sent.
        {booking.customerOfferPaisa != null
          ? ` You offered ${formatPrice(booking.customerOfferPaisa / 100)} for the whole job — the provider can accept it, decline it, or send a counter-offer.`
          : ' The provider will accept it or send you a price.'}{' '}
        You can chat once it is accepted.
      </AppText>
    )
  }
  if (booking.status === 'DECLINED') {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        The provider declined this request
        {booking.cancellation?.reason ? `: ${booking.cancellation.reason}` : '.'} You can ask another provider for the
        same job.
      </AppText>
    )
  }
  if (booking.status === 'PROPOSED') {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        The provider sent a price and time for your request. Accept it to book the slot, or decline and tell them what
        you would prefer in the chat.
      </AppText>
    )
  }
  if (booking.status === 'ACCEPTED') {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        Agreed at {formatPrice((booking.agreedPricePaisa ?? 0) / 100)} for{' '}
        {formatKarachiDateTime(booking.scheduledStart)}. The provider will start the job when they arrive. Pay them at
        the door.
      </AppText>
    )
  }
  if (booking.status === 'IN_PROGRESS') {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        The job is in progress. When it is finished the provider states the final amount, and you confirm it here.
      </AppText>
    )
  }
  if (booking.status === 'CONFIRMED') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successSoft }}>
        <Feather name="check-circle" size={16} color={colors.success} style={{ marginTop: 2 }} />
        <AppText variant="small" style={{ flex: 1, color: colors.success, lineHeight: 20 }}>
          Confirmed{booking.confirmedBy === 'AUTO' ? ' automatically' : ''} on{' '}
          {formatKarachiDateTime(booking.confirmedAt)}. Thank you for using CityCart.
        </AppText>
      </View>
    )
  }
  if (booking.status === 'DISPUTED') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.cream }}>
        <Feather name="alert-triangle" size={16} color={colors.clay} style={{ marginTop: 2 }} />
        <AppText variant="small" style={{ flex: 1, color: colors.clay, lineHeight: 20 }}>
          CityCart is reviewing your dispute. They will contact both sides and record the decision here.
        </AppText>
      </View>
    )
  }
  if (booking.cancellation) {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        Cancelled by {String(booking.cancellation.by || 'you').toLowerCase()} on{' '}
        {formatKarachiDateTime(booking.cancellation.at)}: {booking.cancellation.reason}
      </AppText>
    )
  }
  return (
    <AppText variant="small" style={{ lineHeight: 20 }}>
      This booking is closed.
    </AppText>
  )
}

function ProposalCard({ booking, onDone }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const proposal = booking.activeProposal

  async function answer(action) {
    setBusy(action)
    setError('')
    try {
      const updated = await answerProposal(booking._id, action)
      onDone(
        updated,
        action === 'accept'
          ? 'Proposal accepted. The appointment is on the calendar and the chat is open.'
          : 'Proposal declined.',
      )
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy('')
    }
  }

  if (!proposal) {
    return (
      <AppText variant="small" style={{ lineHeight: 20 }}>
        The provider withdrew this proposal. Ask them for a new time in the chat.
      </AppText>
    )
  }

  return (
    <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(182,71,42,0.25)', backgroundColor: colors.cream }}>
      <AppText variant="small" style={{ ...eyebrowStyle, color: colors.clay }}>
        A price from the provider
      </AppText>
      <AppText variant="title">{formatPrice(proposal.pricePaisa / 100)}</AppText>
      <AppText variant="small" style={{ color: colors.ink, lineHeight: 20 }}>
        {proposal.scope}
      </AppText>
      <AppText variant="small" style={{ fontSize: 12 }}>
        For {formatKarachiDateTime(proposal.scheduledStart)} · reply by{' '}
        {formatKarachiDateTime(proposal.expiresAt)}
      </AppText>
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      <Button
        title={busy === 'accept' ? 'Accepting…' : 'Accept this price'}
        onPress={() => answer('accept')}
        loading={busy === 'accept'}
        disabled={Boolean(busy)}
      />
      <Button
        title="Decline"
        variant="outline"
        onPress={() =>
          Alert.alert('Decline this proposal?', 'The provider is told and the booking closes.', [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Decline', style: 'destructive', onPress: () => answer('decline') },
          ])
        }
        disabled={Boolean(busy)}
      />
    </View>
  )
}

function CompletionCard({ booking, onDone }) {
  const [mode, setMode] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function confirm() {
    setBusy('confirm')
    setError('')
    try {
      const updated = await confirmBooking(booking._id)
      onDone(updated, 'Job confirmed. Thank you — you can review the provider now.')
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy('')
    }
  }

  async function dispute() {
    if (reason.trim().length < 5) return setError('Tell CityCart what went wrong.')
    setBusy('dispute')
    setError('')
    try {
      const updated = await disputeBooking(booking._id, reason.trim())
      onDone(updated, 'Your dispute was sent to CityCart. They will review it and contact both sides.')
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy('')
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.cream }}>
        <AppText variant="small" style={{ lineHeight: 20 }}>
          The provider finished the job for{' '}
          <AppText variant="label" style={{ color: colors.ink }}>
            {formatPrice((booking.finalAmountPaisa ?? 0) / 100)}
          </AppText>
          . Confirm the work, or tell CityCart if something is wrong.
          {booking.autoConfirmAt
            ? ` CityCart confirms automatically on ${formatKarachiDateTime(booking.autoConfirmAt)} if you do nothing.`
            : ''}
        </AppText>
      </View>
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      {mode === 'dispute' ? (
        <View style={{ gap: spacing.sm }}>
          <TextField
            label="What went wrong?"
            value={reason}
            onChangeText={(value) => {
              setReason(value)
              setError('')
            }}
            multiline
            maxLength={1000}
            placeholder="Tell CityCart what happened."
          />
          <Button
            title={busy === 'dispute' ? 'Sending…' : 'Send dispute to CityCart'}
            onPress={dispute}
            loading={busy === 'dispute'}
            disabled={Boolean(busy)}
          />
          <Button title="Go back" variant="outline" onPress={() => setMode('')} disabled={Boolean(busy)} />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button
            title={busy === 'confirm' ? 'Confirming…' : 'Confirm the job is done'}
            onPress={() =>
              Alert.alert('Confirm the job?', 'Confirm the work is finished and the final amount is correct?', [
                { text: 'Not yet', style: 'cancel' },
                { text: 'Confirm', onPress: confirm },
              ])
            }
            loading={busy === 'confirm'}
            disabled={Boolean(busy)}
          />
          <Button title="Report a problem" variant="outline" onPress={() => setMode('dispute')} disabled={Boolean(busy)} />
        </View>
      )}
    </View>
  )
}

function CancelCard({ booking, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const late = ['ACCEPTED', 'IN_PROGRESS'].includes(booking.status)

  async function submit() {
    if (reason.trim().length < 3) return setError('Tell the provider why.')
    setBusy(true)
    setError('')
    try {
      const updated = await cancelBooking(booking._id, reason.trim())
      onDone(updated, 'Booking cancelled. The provider has been told.')
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button title="Cancel this booking" variant="outline" onPress={() => setOpen(true)} />
    )
  }

  return (
    <Card style={{ gap: spacing.md, borderColor: 'rgba(182,71,42,0.25)' }}>
      {late ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Feather name="alert-triangle" size={15} color={colors.clay} style={{ marginTop: 2 }} />
          <AppText variant="small" style={{ flex: 1, color: colors.clay, lineHeight: 19 }}>
            The provider already accepted. This is recorded as a late cancellation.
          </AppText>
        </View>
      ) : null}
      <TextField
        label="Why are you cancelling?"
        value={reason}
        onChangeText={(value) => {
          setReason(value)
          setError('')
        }}
        maxLength={500}
      />
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      <Button
        title={busy ? 'Cancelling…' : 'Yes, cancel it'}
        onPress={() =>
          Alert.alert('Cancel this booking?', 'This cannot be undone.', [
            { text: 'Keep booking', style: 'cancel' },
            { text: 'Cancel it', style: 'destructive', onPress: submit },
          ])
        }
        loading={busy}
        disabled={busy}
      />
      <Button title="Keep booking" variant="outline" onPress={() => setOpen(false)} disabled={busy} />
    </Card>
  )
}

function ReviewCard({ booking, onReview }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const review = await postBookingReview(booking._id, { rating, ...(comment.trim() && { comment: comment.trim() }) })
      onReview(review)
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  if (booking.review) {
    return (
      <View style={{ gap: spacing.xs }}>
        <Stars value={booking.review.rating} />
        {booking.review.comment ? (
          <AppText variant="small" style={{ color: colors.ink, lineHeight: 20 }}>
            {booking.review.comment}
          </AppText>
        ) : null}
        {booking.review.providerReply?.body ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.cream }}>
            <AppText variant="small" style={{ lineHeight: 19 }}>
              <AppText variant="label">The provider replied: </AppText>
              {booking.review.providerReply.body}
            </AppText>
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="label">Your rating</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            onPress={() => setRating(value)}
            accessibilityRole="button"
            accessibilityLabel={`${value} ${value === 1 ? 'star' : 'stars'}`}
            accessibilityState={{ selected: rating === value }}
            style={{
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: value <= rating ? 'rgba(182,71,42,0.4)' : colors.line,
              backgroundColor: value <= rating ? colors.cream : colors.surface,
            }}
          >
            <AppText style={{ color: value <= rating ? colors.clay : colors.line, fontSize: 20 }}>★</AppText>
          </Pressable>
        ))}
      </View>
      <TextField
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={2000}
        placeholder="How was the job?"
      />
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      <Button title={busy ? 'Posting…' : 'Post review'} onPress={submit} loading={busy} disabled={busy} />
    </View>
  )
}

function History({ events = [] }) {
  if (events.length === 0) {
    return (
      <AppText variant="small" style={{ color: colors.muted }}>
        No activity yet.
      </AppText>
    )
  }
  return (
    <View style={{ gap: spacing.md }}>
      {events.map((event, index) => {
        const detail = eventDetail(event)
        return (
          <View key={`${event.type}-${index}`} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: colors.clay }} />
            <View style={{ flex: 1, gap: 1 }}>
              <AppText variant="label">{eventLabel(event)}</AppText>
              <AppText variant="small" style={{ fontSize: 11.5 }}>
                {formatKarachiDateTime(event.at)}
                {event.byRole ? ` · ${humanize(event.byRole)}` : ''}
              </AppText>
              {detail ? (
                <AppText variant="small" style={{ lineHeight: 19 }}>
                  {detail}
                </AppText>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function BookingDetail({ id }) {
  const router = useRouter()
  const remote = useRemote(`booking:${id}`, () => fetchBooking(id))
  const [override, setOverride] = useState(null)
  const [notice, setNotice] = useState('')
  const booking = override?.id === id ? override.booking : remote.data

  function onDone(next, message) {
    setOverride({ id, booking: next })
    if (message) setNotice(message)
  }

  function onReview(review) {
    setOverride({ id, booking: { ...booking, review } })
    setNotice('Thank you — your review is now on the provider’s page.')
  }

  if (remote.status === 'loading') {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={28} />
        <Skeleton height={150} />
        <Skeleton height={90} />
        <Skeleton height={120} />
      </View>
    )
  }

  if (remote.status === 'error' || !booking) {
    const gone = [400, 404].includes(remote.httpStatus) || (remote.status === 'ready' && !booking)
    return (
      <View style={{ padding: spacing.lg }}>
        <EmptyState
          icon={gone ? 'calendar' : 'wifi-off'}
          tone={gone ? 'default' : 'error'}
          title={gone ? 'Booking not found' : "Couldn't load this booking"}
          message={gone ? 'This booking is not available on your account.' : remote.error}
          action={
            gone ? (
              <Button title="My bookings" onPress={() => router.replace('/bookings')} />
            ) : (
              <Button title="Try again" onPress={remote.reload} />
            )
          }
        />
      </View>
    )
  }

  const provider = booking.provider || {}
  const address = booking.address || {}

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }}>
      <View style={{ gap: 2 }}>
        <AppText variant="small" style={eyebrowStyle}>
          Booking {booking.bookingNumber}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <AppText variant="title" accessibilityRole="header" style={{ flex: 1, fontSize: 26, lineHeight: 32 }}>
            {booking.offering?.title || 'Service'}
          </AppText>
          <StatusPill value={booking.status} />
        </View>
        <AppText variant="small" style={{ fontSize: 12 }}>
          Requested {formatKarachiDateTime(booking.createdAt)}
        </AppText>
      </View>

      {notice ? (
        <View accessibilityRole="alert" style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.successSoft }}>
          <AppText variant="small" style={{ color: colors.success, lineHeight: 19 }}>
            {notice}
          </AppText>
        </View>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <ProductImage
            src={booking.offering?.image}
            name={booking.offering?.title}
            width={64}
            style={{ width: 64, height: 64, borderRadius: radius.sm }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="strong">{booking.offering?.title}</AppText>
            <AppText variant="small">
              {durationLabel(booking.offering?.durationMinutes)} · from{' '}
              {formatPrice((booking.offering?.startingAtPrice ?? 0) / 100)}
            </AppText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md }}>
          <DetailRow label="Appointment" value={formatKarachiDateTime(bookingWhen(booking))} />
          <DetailRow label="Price" value={formatPrice(priceOf(booking) / 100)} />
          {booking.customerOfferPaisa != null ? (
            <DetailRow label="Your offer" value={formatPrice(booking.customerOfferPaisa / 100)} />
          ) : null}
        </View>
        {booking.note ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.cream }}>
            <AppText variant="small" style={{ lineHeight: 19 }}>
              <AppText variant="label">Your note: </AppText>
              {booking.note}
            </AppText>
          </View>
        ) : null}
        {booking.completionNote ? (
          <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.cream }}>
            <AppText variant="small" style={{ lineHeight: 19 }}>
              <AppText variant="label">Provider’s note: </AppText>
              {booking.completionNote}
            </AppText>
          </View>
        ) : null}
      </Card>

      <Section eyebrow="What happens now" title="Next step">
        <StatusMessage booking={booking} />
        {booking.status === 'PROPOSED' ? <ProposalCard booking={booking} onDone={onDone} /> : null}
        {booking.status === 'COMPLETED' ? <CompletionCard booking={booking} onDone={onDone} /> : null}
        {booking.status === 'CONFIRMED' ? (
          <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md }}>
            <AppText variant="label">Review {provider.displayName || 'the provider'}</AppText>
            <ReviewCard booking={booking} onReview={onReview} />
          </View>
        ) : null}
      </Section>

      <Section title="Messages">
        <AppText variant="small" style={{ lineHeight: 19 }}>
          {booking.canChat
            ? 'Private chat about this booking.'
            : 'Chat opens when the provider accepts your request. Until then, they reply with a proposal.'}
        </AppText>
        {booking.canChat ? (
          <Button
            title={booking.unread > 0 ? `Open chat (${booking.unread} new)` : 'Open chat'}
            onPress={() =>
              router.push({
                pathname: `/chat/${booking._id}`,
                params: { kind: 'booking', name: provider.displayName || 'Service provider' },
              })
            }
          />
        ) : null}
      </Section>

      <Section title="History">
        <History events={booking.events} />
      </Section>

      {canCancel(booking) ? <CancelCard booking={booking} onDone={onDone} /> : null}

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="small" style={eyebrowStyle}>
          Your provider
        </AppText>
        {provider.slug ? (
          <Pressable
            onPress={() => router.push(`/service/${provider.slug}`)}
            accessibilityRole="link"
            accessibilityLabel={`Open ${provider.displayName} profile`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <ProductImage src={provider.avatar} name={provider.displayName} width={44} style={{ width: 44, height: 44, borderRadius: radius.pill }} />
            <AppText variant="strong" style={{ flex: 1 }}>
              {provider.displayName}
            </AppText>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        ) : (
          <AppText variant="strong">{provider.displayName || 'Service provider'}</AppText>
        )}
        {provider.phone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Feather name="phone" size={14} color={colors.clay} />
            <AppText variant="small">{provider.phone}</AppText>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Feather name="map-pin" size={14} color={colors.clay} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <AppText variant="small" style={{ lineHeight: 19 }}>
              {address.addressLine}
            </AppText>
            <AppText variant="small" style={{ lineHeight: 19 }}>
              {[address.blockName, address.city].filter(Boolean).join(', ')}
            </AppText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm }}>
          <Feather name="calendar" size={14} color={colors.clay} />
          <AppText variant="small">Pay at the door — no online payment.</AppText>
        </View>
      </Card>

      <Button title="Browse services" variant="outline" onPress={() => router.navigate('/services')} />
    </ScrollView>
  )
}

export default function BookingScreen() {
  const rawId = useLocalSearchParams().id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Booking
        </AppText>
      </View>
      <RequireCustomer
        next={`/bookings/${id || ''}`}
        icon="calendar"
        title="Sign in to see this booking"
        message="Your service appointments are kept in your account."
      >
        {id ? <BookingDetail key={id} id={id} /> : null}
      </RequireCustomer>
    </SafeAreaView>
  )
}
