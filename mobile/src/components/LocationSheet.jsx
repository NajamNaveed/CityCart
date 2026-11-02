import { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import Button from './ui/Button'
import SearchBar from './ui/SearchBar'
import Spinner from './ui/Spinner'
import NearbyMap from './NearbyMap'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { formatDistance } from '../utils/geo'
import { colors, minTouch, radius, spacing } from '../theme'

const MESSAGES = {
  denied: 'Location permission was not given. Drop a pin on the map, or choose your area below.',
  servicesOff: 'Location is switched off on this phone. Turn it on and try again, drop a pin, or choose your area below.',
  timeout: 'Finding your location took too long. Try again, drop a pin, or choose your area below.',
  outside: "We don't serve this spot yet. Drop a pin, or choose a city and area below.",
  error: "We couldn't find your location. Drop a pin, or choose your area below.",
}

function BlockChips({ title, hint, options, blockIds, onToggle }) {
  return (
    <View style={{ marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, padding: spacing.md, gap: spacing.sm }}>
      <AppText variant="label">{title}</AppText>
      {hint ? <AppText variant="small">{hint}</AppText> : null}
      <View accessibilityRole="group" accessibilityLabel={title} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((b) => {
          const on = blockIds.includes(b._id)
          return (
            <Pressable
              key={b._id}
              onPress={() => onToggle(b._id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                minHeight: 40,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? colors.ink : colors.line,
                backgroundColor: on ? colors.ink : colors.surface,
              }}
            >
              {on ? <Feather name="check" size={14} color={colors.white} /> : null}
              <AppText variant="label" style={{ color: on ? colors.white : colors.ink }}>
                {b.name}
              </AppText>
              {typeof b.distanceKm === 'number' && b.distanceKm > 0 ? (
                <AppText variant="small" style={{ color: on ? colors.white : colors.muted, fontSize: 11 }}>
                  {formatDistance(b.distanceKm)}
                </AppText>
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/**
 * "Where are you shopping?": use my location, drop a pin on the map, or pick one
 * or more areas by hand. Opened from anywhere (the tab header, checkout), driven
 * by the Nearby provider so every screen sees the same choice.
 */
export default function LocationSheet() {
  const { pickerOpen } = useNearby()
  // Mounted only while open, so every visit starts with no leftover search or map.
  return pickerOpen ? <LocationPicker /> : null
}

function LocationPicker() {
  const { cities, cityId, setCityId } = useCity()
  const {
    blocks,
    blocksReady,
    blockIds,
    coords,
    pinned,
    choices,
    status,
    canAskAgain,
    closePicker,
    detect,
    setPin,
    toggleBlock,
    toggleManualBlock,
    clearLocation,
  } = useNearby()
  const [search, setSearch] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? blocks.filter((b) => b.name.toLowerCase().includes(needle)) : blocks
  }, [blocks, search])

  async function useMyLocation() {
    const result = await detect()
    if (result === 'found') closePicker()
  }

  const overlapping = choices.containing.length > 1
  const between = status === 'border' || (blockIds.length === 0 && choices.nearest.length > 0)
  const blocked = status === 'denied' && !canAskAgain
  const message =
    status === 'denied' && !canAskAgain
      ? 'Location is blocked for CityCart. Turn it on in Settings, drop a pin, or choose your area below.'
      : MESSAGES[status]

  const rowStyle = (active) => ({
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: active ? colors.sand : colors.surface,
  })

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closePicker} statusBarTranslucent>
      <Pressable onPress={closePicker} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.45)' }} />
      <SafeAreaView edges={['bottom']} style={{ height: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 20 }}>
                Where are you shopping?
              </AppText>
              <Pressable onPress={closePicker} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
                <Feather name="x" size={24} color={colors.ink} />
              </Pressable>
            </View>

            <Button title="Use my current location" onPress={useMyLocation} loading={status === 'detecting'} />
            <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
              {status === 'detecting' ? <Spinner label="Finding your area…" /> : null}
              {message ? (
                <AppText variant="small" style={{ color: colors.clay }}>
                  {message}
                </AppText>
              ) : null}
              {blocked ? <Button title="Open Settings" variant="outline" onPress={() => Linking.openSettings()} /> : null}
            </View>

            {overlapping ? (
              <BlockChips
                title={`This spot is in ${choices.containing.length} blocks`}
                hint="Shop in one or in all of them."
                options={choices.containing}
                blockIds={blockIds}
                onToggle={toggleBlock}
              />
            ) : null}
            {between ? (
              <BlockChips
                title="This spot is between blocks"
                hint="Pick the blocks you want to shop in."
                options={choices.nearest}
                blockIds={blockIds}
                onToggle={toggleBlock}
              />
            ) : null}

            <Button title={mapOpen ? 'Hide the map' : 'Pick a spot on the map'} variant="outline" onPress={() => setMapOpen((v) => !v)} />
            {mapOpen ? (
              <View style={{ gap: spacing.sm }}>
                <AppText variant="small">
                  Tap where you want to shop or have your order delivered, for example another part of town. Shaded areas are where we deliver.
                </AppText>
                {!cityId || !blocksReady ? (
                  <Spinner label="Loading the map…" />
                ) : (
                  <NearbyMap zones={blocks} selectedIds={blockIds} pin={coords && pinned ? coords : null} onPick={setPin} height={260} />
                )}
              </View>
            ) : null}

            <AppText variant="small" style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11 }}>
              Or choose manually
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {cities.map((c) => (
                <Pressable
                  key={c._id}
                  onPress={() => setCityId(c._id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cityId === c._id }}
                  style={{
                    minHeight: 40,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: cityId === c._id ? colors.ink : colors.line,
                    backgroundColor: cityId === c._id ? colors.ink : colors.surface,
                  }}
                >
                  <AppText variant="label" style={{ color: cityId === c._id ? colors.white : colors.ink }}>
                    {c.name}
                  </AppText>
                </Pressable>
              ))}
            </View>

            {!cityId ? (
              <AppText variant="small">Pick a city to see its areas.</AppText>
            ) : !blocksReady ? (
              <Spinner label="Loading areas…" />
            ) : blocks.length === 0 ? (
              <AppText variant="small">No areas have been set up for this city yet.</AppText>
            ) : (
              <>
                <SearchBar value={search} onChangeText={setSearch} placeholder="Search your area…" label="Search areas" />
                <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' }}>
                  <Pressable
                    onPress={clearLocation}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: blockIds.length === 0 }}
                    style={rowStyle(blockIds.length === 0)}
                  >
                    <AppText variant={blockIds.length === 0 ? 'strong' : 'body'}>Whole city (no specific area)</AppText>
                    {blockIds.length === 0 ? <Feather name="check" size={20} color={colors.clay} /> : null}
                  </Pressable>
                  {shown.map((b) => {
                    const on = blockIds.includes(b._id)
                    return (
                      <Pressable
                        key={b._id}
                        onPress={() => toggleManualBlock(b._id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[rowStyle(on), { borderTopWidth: 1, borderTopColor: colors.line }]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                          <Feather name="map-pin" size={15} color={colors.muted} />
                          <AppText variant={on ? 'strong' : 'body'}>{b.name}</AppText>
                        </View>
                        {on ? <Feather name="check" size={20} color={colors.clay} /> : null}
                      </Pressable>
                    )
                  })}
                </View>
                {shown.length === 0 ? (
                  <AppText variant="small">No area matches “{search}”.</AppText>
                ) : (
                  <AppText variant="small">You can choose more than one area.</AppText>
                )}
              </>
            )}

            <Button title="Done" onPress={closePicker} />
            <AppText variant="small" style={{ fontSize: 12 }}>
              Your location is saved only on this phone. We use it to find shops near you and don’t store it on our servers.
            </AppText>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
