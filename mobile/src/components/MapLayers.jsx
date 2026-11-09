import { useState } from 'react'
import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import OptionSheet from './ui/OptionSheet'
import { colors, radius, spacing } from '../theme'

const STATE_LABEL = { all: 'All', mine: 'Mine', off: 'Off' }
const NEXT_LABEL = { all: 'only mine', mine: 'off', off: 'everything' }

const buttonStyle = (on) => ({
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  minHeight: 36,
  paddingHorizontal: spacing.sm,
  backgroundColor: on ? colors.ink : colors.surface,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.line,
})

function Control({ icon, label, badge, on, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={buttonStyle(on)}
    >
      <Feather name={icon} size={14} color={on ? colors.white : colors.ink} />
      <AppText variant="label" numberOfLines={1} style={{ color: on ? colors.white : colors.ink, fontSize: 12 }}>
        {label}
      </AppText>
      {badge ? (
        <View
          style={{
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: radius.pill,
            backgroundColor: on ? 'rgba(255,255,255,0.2)' : colors.sand,
          }}
        >
          <AppText style={{ fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase', color: on ? colors.white : colors.muted }}>
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  )
}

/**
 * The map's own overlay, shared by stores and services: a city picker that only
 * moves the view (it never changes the saved shopping spot), one button per
 * layer that cycles everything -> mine -> hidden, and screen-specific actions.
 */
export default function MapLayers({ cities = [], cityId, onCityChange, layers = [], actions = [] }) {
  const [open, setOpen] = useState(false)
  const city = cities.find((item) => item._id === cityId) || null
  const options = cities.map((item) => ({ value: item._id, label: item.name }))

  return (
    <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, left: spacing.sm, alignItems: 'flex-end', gap: spacing.sm }}>
      {cities.length > 0 ? (
        <Control
          icon="map-pin"
          label={city ? city.name : 'Choose city'}
          on={false}
          onPress={() => setOpen(true)}
          accessibilityLabel={city ? `City shown on the map: ${city.name}. Tap to change.` : 'Choose the city shown on the map'}
        />
      ) : null}

      {layers.length > 0 ? (
        <View style={{ flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
          {layers.map(({ key, label, mineLabel, icon, state, onCycle }, index) => {
            const on = state !== 'off'
            return (
              <Pressable
                key={key}
                onPress={onCycle}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${label}: showing ${state === 'mine' ? mineLabel || 'mine' : STATE_LABEL[state]}. Tap to show ${NEXT_LABEL[state]}.`}
                hitSlop={4}
                style={[
                  buttonStyle(on),
                  {
                    borderRadius: 0,
                    borderWidth: 0,
                    borderLeftWidth: index > 0 ? 1 : 0,
                    borderLeftColor: colors.line,
                    paddingHorizontal: spacing.sm,
                  },
                ]}
              >
                <Feather name={icon} size={14} color={on ? colors.white : colors.muted} />
                <AppText variant="label" numberOfLines={1} style={{ color: on ? colors.white : colors.muted, fontSize: 12 }}>
                  {label}
                </AppText>
                <View
                  style={{
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: radius.pill,
                    backgroundColor: on ? 'rgba(255,255,255,0.2)' : colors.sand,
                  }}
                >
                  <AppText style={{ fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase', color: on ? colors.white : colors.muted }}>
                    {on ? STATE_LABEL[state] : 'Off'}
                  </AppText>
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {actions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs }}>
          {actions.map(({ key, label, icon, active, onPress }) => (
            <Control key={key} icon={icon} label={label} on={Boolean(active)} onPress={onPress} accessibilityLabel={label} />
          ))}
        </View>
      ) : null}

      <OptionSheet
        visible={open}
        title="City on the map"
        options={options}
        selected={cityId}
        onSelect={(value) => {
          setOpen(false)
          // Tapping the city already shown re-frames it, like a recenter.
          onCityChange?.(value)
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  )
}
