import { useState } from 'react'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../../../components/ui/AppText'
import Button from '../../../components/ui/Button'
import Card from '../../../components/ui/Card'
import EmptyState from '../../../components/ui/EmptyState'
import Skeleton from '../../../components/ui/Skeleton'
import BackButton from '../../../components/BackButton'
import ExpandableText from '../../../components/ExpandableText'
import ProductImage from '../../../components/ProductImage'
import Stars from '../../../components/Stars'
import { useAuth } from '../../../hooks/useAuth'
import { useRemote } from '../../../hooks/useRemote'
import { getErrorMessage } from '../../../services/api'
import { fetchServiceProvider } from '../../../services/services'
import { startProviderChat } from '../../../services/providerChats'
import { formatKarachiDate, minuteLabel, durationLabel } from '../../../utils/serviceSlots'
import { formatPrice } from '../../../utils/format'
import { loginHref } from '../../../utils/nav'
import { colors, radius, spacing } from '../../../theme'

function SectionTitle({ eyebrow, title, right }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: spacing.md, marginBottom: spacing.md }}>
      <View style={{ flex: 1 }}>
        <AppText variant="small" style={{ fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }}>
          {eyebrow}
        </AppText>
        <AppText variant="heading" accessibilityRole="header" style={{ marginTop: 2 }}>
          {title}
        </AppText>
      </View>
      {right}
    </View>
  )
}

function ProviderHero({ provider, width }) {
  const block = provider.block
  return (
    <View style={{ height: 230, backgroundColor: colors.ink, overflow: 'hidden' }}>
      {provider.coverImage ? (
        <ProductImage src={provider.coverImage} name={provider.displayName} width={width} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.55)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, padding: spacing.lg }}>
        <View style={{ width: 68, height: 68, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
          <ProductImage src={provider.avatar} name={provider.displayName} width={68} style={{ width: 68, height: 68 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="small" numberOfLines={1} style={{ color: colors.cream, fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }}>
            {provider.category?.name || 'Local services'}
          </AppText>
          <AppText variant="heading" numberOfLines={2} style={{ color: colors.white, fontSize: 28, lineHeight: 34, marginTop: 2 }}>
            {provider.displayName}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: 2 }}>
            {block?.name ? (
              <>
                <Feather name="map-pin" size={12} color={colors.clay} />
                <AppText variant="small" style={{ color: colors.cream, fontSize: 12 }}>
                  Serves {block.name}
                </AppText>
              </>
            ) : null}
            {provider.city?.name ? (
              <AppText variant="small" style={{ color: colors.cream, fontSize: 12 }}>
                · {provider.city.name}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

function ProviderBody({ provider }) {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { status, user } = useAuth()
  const isCustomer = status === 'signedIn' && user?.role === 'CUSTOMER'
  const signedIn = status === 'signedIn'
  const [messaging, setMessaging] = useState(false)
  const [messageError, setMessageError] = useState('')

  const slug = provider.slug
  const block = provider.block
  const offerings = provider.offerings || []
  const reviews = provider.reviews || []
  const windows = provider.availability?.windows || []
  const blackout = provider.availability?.blackoutDates || []

  async function messageProvider() {
    if (!signedIn) {
      router.push(loginHref(`/service/${slug}`))
      return
    }
    if (!isCustomer) return
    setMessaging(true)
    setMessageError('')
    try {
      const result = await startProviderChat(provider._id)
      router.push({
        pathname: `/chat/${result.conversationId}`,
        params: { kind: 'provider', name: result.provider?.name || provider.displayName },
      })
    } catch (err) {
      setMessageError(getErrorMessage(err, "Couldn't open the chat."))
    } finally {
      setMessaging(false)
    }
  }

  function requestBooking() {
    if (!signedIn) {
      router.push(loginHref(`/service/${slug}/book`))
      return
    }
    if (!isCustomer) return
    router.push(`/service/${slug}/book`)
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <ProviderHero provider={provider} width={width} />

      <View style={{ padding: spacing.lg, gap: spacing.xl }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: -spacing.xl }}>
          <View style={{ flex: 1, minWidth: 200, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}>
            {provider.ratingCount > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Stars value={provider.ratingAvg} size={14} />
                <AppText variant="label">{Number(provider.ratingAvg).toFixed(1)}</AppText>
                <AppText variant="small">
                  ({provider.ratingCount} {provider.ratingCount === 1 ? 'review' : 'reviews'})
                </AppText>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Feather name="star" size={14} color={colors.clay} />
                <AppText variant="small" style={{ color: colors.clay }}>
                  {provider.isNew ? 'New on CityCart' : 'No reviews yet'}
                </AppText>
              </View>
            )}
            <AppText variant="small">
              {provider.completedBookings} completed {provider.completedBookings === 1 ? 'job' : 'jobs'}
            </AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="small" style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Starting at
            </AppText>
            <AppText variant="heading" style={{ fontSize: 24, lineHeight: 30 }}>
              {formatPrice((provider.startingAtPrice || 0) / 100)}
            </AppText>
          </View>
        </View>

        {provider.bio ? <ExpandableText text={provider.bio} style={{ color: colors.muted }} /> : null}

        <View style={{ gap: spacing.md }}>
          <Card>
            <AppText variant="small" style={{ fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }}>
              Book this provider
            </AppText>
            <AppText variant="heading" style={{ fontSize: 20, lineHeight: 26, marginTop: 2 }}>
              Request a booking
            </AppText>
            <AppText variant="small" style={{ marginTop: spacing.xs, lineHeight: 19 }}>
              Choose a service, a time and where the job happens. {provider.displayName} confirms the price before work
              starts.
            </AppText>
            {signedIn && !isCustomer ? (
              <AppText variant="small" style={{ color: colors.clay, marginTop: spacing.md }}>
                Only customer accounts can book a service.
              </AppText>
            ) : (
              <Button
                title={signedIn ? 'Request a booking' : 'Sign in to book'}
                onPress={requestBooking}
                style={{ marginTop: spacing.md }}
              />
            )}
            <AppText variant="small" style={{ textAlign: 'center', fontSize: 11, marginTop: spacing.sm }}>
              No payment is taken here. Pay the provider at the door.
            </AppText>
          </Card>

          {!signedIn || isCustomer ? (
            <Card>
              <AppText variant="small" style={{ fontSize: 10, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' }}>
                Not ready to book?
              </AppText>
              <AppText variant="heading" style={{ fontSize: 20, lineHeight: 26, marginTop: 2 }}>
                Ask a question
              </AppText>
              <AppText variant="small" style={{ marginTop: spacing.xs, lineHeight: 19 }}>
                Chat with {provider.displayName} about the job first. Prices and times are still agreed in a booking.
              </AppText>
              {messageError ? (
                <AppText variant="small" accessibilityLiveRegion="polite" style={{ color: colors.danger, marginTop: spacing.sm }}>
                  {messageError}
                </AppText>
              ) : null}
              <Button
                title={`Message ${provider.displayName}`}
                variant="outline"
                onPress={messageProvider}
                loading={messaging}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}
        </View>

        <View>
          <SectionTitle
            eyebrow="What they do"
            title="Services"
            right={
              offerings.length > 0 ? (
                <AppText variant="small">
                  {offerings.length} {offerings.length === 1 ? 'service' : 'services'}
                </AppText>
              ) : null
            }
          />
          {offerings.length === 0 ? (
            <Card>
              <AppText variant="small" style={{ lineHeight: 19 }}>
                This provider has not published a service list yet. Their starting price is shown above.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: spacing.md }}>
              {offerings.map((offering) => (
                <Card key={offering._id} style={{ flexDirection: 'row', gap: spacing.md }}>
                  <ProductImage
                    src={offering.images?.[0]}
                    name={offering.title}
                    width={72}
                    style={{ width: 72, height: 72, borderRadius: radius.md }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="strong" style={{ fontSize: 16 }}>
                      {offering.title}
                    </AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs }}>
                      <AppText variant="label">{formatPrice((offering.startingAtPrice || 0) / 100)}</AppText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Feather name="clock" size={13} color={colors.clay} />
                        <AppText variant="small" style={{ fontSize: 12 }}>
                          {durationLabel(offering.durationMinutes)}
                        </AppText>
                      </View>
                    </View>
                    {offering.description ? (
                      <AppText variant="small" style={{ marginTop: spacing.xs, lineHeight: 19 }}>
                        {offering.description}
                      </AppText>
                    ) : null}
                  </View>
                </Card>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, borderRadius: radius.lg, backgroundColor: colors.cream, padding: spacing.md }}>
            <Feather name="tool" size={15} color={colors.clay} style={{ marginTop: 2 }} />
            <AppText variant="small" style={{ flex: 1, lineHeight: 19 }}>
              Prices are starting points. Agree the final scope and price with {provider.displayName} before the job.
            </AppText>
          </View>
        </View>

        <View>
          <SectionTitle eyebrow="When they work" title="Working hours" />
          {provider.availability?.isPublished ? (
            <Card>
              <View style={{ gap: spacing.sm }}>
                {windows.map((item) => (
                  <View key={`${item.weekday}-${item.startMinute}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                    <AppText variant="small" style={{ color: colors.muted }}>
                      {item.weekdayName}
                    </AppText>
                    <AppText variant="label">
                      {minuteLabel(item.startMinute)} – {minuteLabel(item.endMinute)}
                    </AppText>
                  </View>
                ))}
              </View>
              {blackout.length > 0 ? (
                <AppText variant="small" style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm, marginTop: spacing.md, lineHeight: 19 }}>
                  Not available on {blackout.map(formatKarachiDate).join(', ')}.
                </AppText>
              ) : null}
            </Card>
          ) : (
            <Card>
              <AppText variant="small" style={{ lineHeight: 19 }}>
                No fixed working hours published. Request any future time and {provider.displayName} will confirm the
                slot.
              </AppText>
            </Card>
          )}
        </View>

        <View>
          <SectionTitle
            eyebrow="Neighbours’ verdict"
            title="Reviews"
            right={
              provider.ratingCount > 0 ? (
                <AppText variant="small">
                  {Number(provider.ratingAvg).toFixed(1)} from {provider.ratingCount}
                </AppText>
              ) : null
            }
          />
          {reviews.length === 0 ? (
            <Card>
              <AppText variant="small" style={{ lineHeight: 19 }}>
                No reviews yet. Only customers with a confirmed booking can review.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: spacing.md }}>
              {reviews.map((review) => (
                <Card key={review._id} style={{ gap: spacing.xs }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                    <Stars value={review.rating} size={13} />
                    <AppText variant="small" style={{ fontSize: 11.5 }}>
                      {review.reviewerName} · {formatKarachiDate(review.createdAt)}
                    </AppText>
                  </View>
                  {review.serviceTitle ? (
                    <AppText variant="small" style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' }}>
                      {review.serviceTitle}
                    </AppText>
                  ) : null}
                  {review.comment ? (
                    <AppText variant="body" style={{ fontSize: 14, lineHeight: 21 }}>
                      {review.comment}
                    </AppText>
                  ) : null}
                  {review.providerReply?.body ? (
                    <View style={{ backgroundColor: colors.paper, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xs }}>
                      <AppText variant="small" style={{ lineHeight: 19 }}>
                        <AppText variant="label">{provider.displayName} replied: </AppText>
                        {review.providerReply.body}
                      </AppText>
                    </View>
                  ) : null}
                </Card>
              ))}
            </View>
          )}
        </View>

        <View>
          <SectionTitle eyebrow="Where they work" title="Service area" />
          <Card>
            <AppText variant="strong">{[block?.name, provider.city?.name].filter(Boolean).join(', ') || 'Not set'}</AppText>
            <AppText variant="small" style={{ marginTop: spacing.xs, lineHeight: 19 }}>
              The exact address is shared once a booking is accepted.
            </AppText>
          </Card>
        </View>

        <Pressable
          onPress={() => router.navigate('/services')}
          accessibilityRole="button"
          accessibilityLabel="Browse more providers"
          style={({ pressed }) => ({
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.ink,
            backgroundColor: pressed ? colors.sand : colors.surface,
          })}
        >
          <AppText variant="label" style={{ fontSize: 15 }}>
            Browse more providers
          </AppText>
        </Pressable>
      </View>
    </ScrollView>
  )
}

function ProviderSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={230} />
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={20} width="55%" />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </View>
    </View>
  )
}

export default function ServiceProviderScreen() {
  const router = useRouter()
  const { slug: rawSlug } = useLocalSearchParams()
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug
  const provider = useRemote(`service-provider:${slug || ''}`, () =>
    slug
      ? fetchServiceProvider(slug)
      : Promise.reject(Object.assign(new Error('bad slug'), { response: { status: 400, data: {} } })),
  )
  const gone = provider.httpStatus === 404 || provider.httpStatus === 400 || (provider.status === 'ready' && !provider.data)

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flex: 1 }}>
        {provider.status === 'loading' ? (
          <ProviderSkeleton />
        ) : provider.status === 'error' || !provider.data ? (
          <View style={{ padding: spacing.lg }}>
            <EmptyState
              icon={gone ? 'tool' : 'wifi-off'}
              tone={gone ? 'default' : 'error'}
              title={gone ? 'Provider not found' : "Couldn't load this provider"}
              message={gone ? 'This provider page is not available. The link may be wrong, or they closed.' : provider.error}
              action={
                gone ? (
                  <Button title="Browse services" onPress={() => router.navigate('/services')} />
                ) : (
                  <Button title="Try again" onPress={provider.reload} />
                )
              }
            />
          </View>
        ) : (
          <ProviderBody key={provider.data._id} provider={provider.data} />
        )}

        <View style={{ position: 'absolute', top: spacing.sm, left: spacing.lg, zIndex: 10 }}>
          <BackButton onDark={provider.status === 'ready' && Boolean(provider.data)} />
        </View>
      </View>
    </SafeAreaView>
  )
}
