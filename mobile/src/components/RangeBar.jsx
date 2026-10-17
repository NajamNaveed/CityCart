import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View } from 'react-native'
import AppText from './ui/AppText'
import Button from './ui/Button'
import Chip from './ui/Chip'
import { useNearby } from '../hooks/useNearby'
import { isRadius, MAX_RADIUS_KM, MIN_RADIUS_KM } from '../utils/range'
import { colors, fonts, minTouch, radius, spacing } from '../theme'

const PRESETS = [
  ['block', 'This block'],
  ['2', '2 km'],
  ['5', '5 km'],
  ['10', '10 km'],
  ['20', '20 km'],
  ['city', 'Whole city'],
]

// How far to search: own block, a preset radius, a custom number of km, or the whole city.
export default function RangeBar() {
  const { range, setRange } = useNearby()
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const custom = isRadius(range) && !PRESETS.some(([value]) => value === range)

  function openCustom() {
    setDraft(custom ? range : '')
    setError('')
    setAsking(true)
  }

  function applyCustom() {
    const km = Number(draft.replace(',', '.'))
    if (!Number.isFinite(km) || km < MIN_RADIUS_KM || km > MAX_RADIUS_KM) {
      setError(`Enter a distance between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km.`)
      return
    }
    setRange(String(km))
    setAsking(false)
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }} accessibilityRole="radiogroup" accessibilityLabel="Search range">
        {PRESETS.map(([value, label]) => (
          <Chip key={value} label={label} selected={range === value} onPress={() => setRange(value)} />
        ))}
        <Chip label={custom ? `${range} km` : 'Custom'} icon="edit-2" selected={custom} onPress={openCustom} accessibilityHint="Type a distance in kilometres" />
      </ScrollView>

      <Modal visible={asking} transparent animationType="fade" onRequestClose={() => setAsking(false)} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(2,6,23,0.45)' }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }}>
            <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 20 }}>
              Search within…
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: error ? colors.danger : colors.line, borderRadius: radius.md, paddingLeft: spacing.md }}>
              <TextInput
                value={draft}
                onChangeText={(text) => {
                  setDraft(text)
                  setError('')
                }}
                autoFocus
                keyboardType="decimal-pad"
                placeholder="e.g. 7.5"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Distance in kilometres"
                onSubmitEditing={applyCustom}
                style={{ flex: 1, minHeight: minTouch - 2, fontFamily: fonts.regular, fontSize: 18, color: colors.ink }}
              />
              <AppText variant="label" style={{ paddingHorizontal: spacing.lg }}>
                km
              </AppText>
            </View>
            {error ? (
              <AppText variant="small" accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
                {error}
              </AppText>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="outline" onPress={() => setAsking(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Apply" onPress={applyCustom} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}
