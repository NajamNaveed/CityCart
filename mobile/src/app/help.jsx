import { useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from '../components/ui/AppText'
import Button from '../components/ui/Button'
import BackButton from '../components/BackButton'
import { usePublicSettings } from '../hooks/usePublicSettings'
import { colors, radius, spacing } from '../theme'

// The same answers as the website's help centre, so one explanation covers both.
const FAQ = [
  {
    q: 'How does cash on delivery work?',
    a: 'You pay the rider in cash at your door. CityCart does not hold your money. The order page shows the amount due, and the rider records the payment when it is collected.',
  },
  {
    q: 'Which areas can I order from?',
    a: 'Every store and professional serves a specific city block, and deliveries are limited to a short radius around that store. Choose your city in Stores or Services to see who serves your area.',
  },
  {
    q: 'Can I order from more than one shop at once?',
    a: 'Yes. One cart can include products from several shops. Each shop receives its own order, so parcels can arrive separately and are confirmed by each seller.',
  },
  {
    q: 'Something arrived damaged or missing. What now?',
    a: 'Open the order and report the problem against the affected item. Keep the packaging and the item as they arrived. The seller reviews the report and CityCart support can step in if you cannot agree.',
  },
  {
    q: 'How do I book a service?',
    a: 'Choose a provider, pick an available date and time, and describe the job. The provider can accept the request or send a price proposal. Everything stays in the booking thread, including chat.',
  },
  {
    q: 'How do I cancel an order or booking?',
    a: 'Open the order or booking and use Cancel while the option is shown. Once a seller has accepted or work has started, message them from the order or booking so the cancellation can be agreed between you.',
  },
]

const LINKS = [
  { icon: 'package', label: 'My orders', hint: 'Track a parcel or report a problem', to: '/orders' },
  { icon: 'calendar', label: 'My bookings', hint: 'Slots, price proposals and provider chat', to: '/bookings' },
  { icon: 'map-pin', label: 'Saved addresses', hint: 'Where your orders are delivered', to: '/addresses' },
]

function openLink(url) {
  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open the app', 'Make sure a mail or phone app is available on this phone.')
  })
}

function TopicRow({ icon, label, hint, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 56,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.sand : colors.surface,
      })}
    >
      <Feather name={icon} size={20} color={colors.clay} />
      <View style={{ flex: 1, paddingVertical: spacing.sm }}>
        <AppText variant="strong">{label}</AppText>
        <AppText variant="small">{hint}</AppText>
      </View>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  )
}

function FaqRow({ item, open, onPress }) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 }}
      >
        <AppText variant="strong" style={{ flex: 1 }}>
          {item.q}
        </AppText>
        <Feather name={open ? 'minus' : 'plus'} size={18} color={colors.clay} />
      </Pressable>
      {open ? (
        <AppText variant="small" style={{ paddingBottom: spacing.md, color: colors.inkSoft }}>
          {item.a}
        </AppText>
      ) : null}
    </View>
  )
}

export default function Help() {
  const router = useRouter()
  const { settings } = usePublicSettings()
  const [open, setOpen] = useState({})
  const supportEmail = String(settings.supportEmail || '').trim()
  const supportPhone = String(settings.supportPhone || '').trim()
  const phoneHref = supportPhone.replace(/[^\d+]/g, '')

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <BackButton />
        <AppText variant="heading" accessibilityRole="header">
          Help & support
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, padding: spacing.lg }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="life-buoy" size={19} color={colors.clay} />
          </View>
          <AppText variant="heading" style={{ fontSize: 20, marginTop: spacing.md }}>
            Write to the support team
          </AppText>
          {supportEmail ? (
            <>
              <AppText variant="small" style={{ marginTop: spacing.xs }}>
                Include your order or booking number so we can find the right seller.
              </AppText>
              <Button title="Email support" onPress={() => openLink(`mailto:${supportEmail}`)} style={{ marginTop: spacing.lg }} />
              <Pressable
                onPress={() => openLink(`mailto:${supportEmail}`)}
                accessibilityRole="link"
                accessibilityLabel={`Email ${supportEmail}`}
                hitSlop={6}
                style={{ minHeight: 36, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs }}
              >
                <AppText variant="label" style={{ color: colors.clay }}>
                  {supportEmail}
                </AppText>
              </Pressable>
            </>
          ) : (
            <AppText variant="small" style={{ marginTop: spacing.xs }}>
              The public support address is being set up. For an existing order, use Messages on the order to reach the
              seller directly.
            </AppText>
          )}
          {supportPhone ? (
            <Pressable
              onPress={() => openLink(`tel:${phoneHref}`)}
              accessibilityRole="link"
              accessibilityLabel={`Call support on ${supportPhone}`}
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 44, marginTop: spacing.sm }}
            >
              <Feather name="phone" size={15} color={colors.clay} />
              <AppText variant="label" style={{ color: colors.clay }}>
                Call {supportPhone}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="label" style={{ textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
            Start here
          </AppText>
          {LINKS.map((link) => (
            <TopicRow key={link.to} icon={link.icon} label={link.label} hint={link.hint} onPress={() => router.push(link.to)} />
          ))}
        </View>

        <View>
          <AppText variant="label" style={{ textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 11 }}>
            Common questions
          </AppText>
          <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
            {FAQ.map((item) => (
              <FaqRow
                key={item.q}
                item={item}
                open={Boolean(open[item.q])}
                onPress={() => setOpen((prev) => ({ ...prev, [item.q]: !prev[item.q] }))}
              />
            ))}
          </View>
        </View>

        <AppText variant="small">Answers here match the CityCart website, so the same advice applies wherever you shop.</AppText>
      </ScrollView>
    </SafeAreaView>
  )
}
