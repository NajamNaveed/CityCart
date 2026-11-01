import { useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import AreaMap from './AreaMap'
import Button from './ui/Button'
import Chip from './ui/Chip'
import SearchBar from './ui/SearchBar'
import Spinner from './ui/Spinner'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { formatDistance } from '../utils/geo'
import { colors, minTouch, radius, spacing } from '../theme'

const MESSAGES = {
  timeout: 'Finding your location took too long. Try again, drop a pin on the map, or choose your area below.',
  servicesOff: 'Location is switched off on this phone. Turn it on and try again, drop a pin on the map, or choose your area below.',
  outside: "We don't serve this spot yet. Choose a city and area below.",
  error: "We couldn't find your location. Drop a pin on the map, or choose your area below.",
}

/** Blocks to tick: where the shopper is standing holds several, or sits between blocks. */
function BlockChoices({ title, hint, options, blockIds, onToggle }) {
  return (
    <View style={{ backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
      <AppText variant="strong">{title}</AppText>
      <AppText variant="small">{hint}</AppText>
      <View accessibilityRole="menu" accessibilityLabel={title} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((b) => (
          <Chip
            key={b._id}
            label={typeof b.distanceKm === 'number' && b.distanceKm > 0 ? `${b.name} · ${formatDistance(b.distanceKm)}` : b.name}
            icon={blockIds.includes(b._id) ? 'check' : undefined}
            selected={blockIds.includes(b._id)}
            onPress={() => onToggle(b._id)}
          />
        ))}
      </View>
    </View>
  )
}

/**
 * "Where are you shopping?": use my location, drop a pin on the map, or pick a city and one or
 * more areas by hand. The phone's own permission prompt only appears when the shopper taps the button.
 */
export default function LocationSheet({ visible, onClose }) {
  const { cities, cityId, setCityId } = useCity()
  const { blocks, blocksReady, blockIds, coords, pinned, choices, status, canAskAgain, detect, setPin, toggleBlock, toggleManualBlock, clearLocation } = useNearby()
  const [search, setSearch] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? blocks.filter((b) => b.name.toLowerCase().includes(needle)) : blocks
  }, [blocks, search])

  async function useMyLocation() {
    if ((await detect()) === 'found') onClose() // one block: nothing left to choose
  }

  const blocked = status === 'denied' && !canAskAgain
  const message =
    status === 'denied'
      ? canAskAgain
        ? 'Location permission was not given. You can drop a pin on the map or choose your area below.'
        : 'Location is blocked for CityCart. Turn it on in Settings, drop a pin on the map, or choose your area below.'
      : MESSAGES[status]
  const overlapping = choices.containing.length > 1
  const between = status === 'border' || (blockIds.length === 0 && choices.nearest.length > 0)

  const rowStyle = (active) => ({
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: active ? colors.sand : colors.surface,
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.45)' }} />
      <SafeAreaView edges={['bottom']} style={{ height: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            data={shown}
            keyExtractor={(b) => b._id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 20 }}>
                    Where are you shopping?
                  </AppText>
                  <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
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
                  <BlockChoices title={`This spot is in ${choices.containing.length} blocks`} hint="Shop in one or in all of them." options={choices.containing} blockIds={blockIds} onToggle={toggleBlock} />
                ) : null}
                {between ? <BlockChoices title="This spot is between blocks" hint="Pick the blocks you want to shop in." options={choices.nearest} blockIds={blockIds} onToggle={toggleBlock} /> : null}

                <Button title={mapOpen ? 'Hide the map' : 'Pick a spot on the map'} variant="outline" onPress={() => setMapOpen((v) => !v)} />
                {mapOpen ? (
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="small">Tap where you want to shop or have your order delivered, for example another part of town. Shaded areas are where we deliver.</AppText>
                    {cityId && blocksReady ? <AreaMap zones={blocks} selectedIds={blockIds} pin={coords && pinned ? coords : null} onPick={setPin} /> : <Spinner label="Loading the map…" />}
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
                {cityId && blocksReady && blocks.length > 0 ? <SearchBar value={search} onChangeText={setSearch} placeholder="Search your area…" label="Search areas" /> : null}
                {!cityId ? <AppText variant="small">Pick a city to see its areas.</AppText> : null}
                {cityId && !blocksReady ? <Spinner label="Loading areas…" /> : null}
                {cityId && blocksReady && blocks.length === 0 ? <AppText variant="small">No areas have been set up for this city yet.</AppText> : null}
                {cityId && blocksReady && blocks.length > 0 ? (
                  <Pressable onPress={clearLocation} accessibilityRole="radio" accessibilityState={{ selected: blockIds.length === 0 }} style={[rowStyle(blockIds.length === 0), { marginHorizontal: -spacing.lg }]}>
                    <AppText variant={blockIds.length === 0 ? 'strong' : 'body'}>Whole city (no specific area)</AppText>
                    {blockIds.length === 0 ? <Feather name="check" size={20} color={colors.clay} /> : null}
                  </Pressable>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              cityId && blocksReady && blocks.length > 0 ? (
                <AppText variant="small" style={{ padding: spacing.lg }}>
                  No area matches “{search}”.
                </AppText>
              ) : null
            }
            renderItem={({ item }) => {
              const on = blockIds.includes(item._id)
              return (
                <Pressable onPress={() => toggleManualBlock(item._id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={rowStyle(on)}>
                  <AppText variant={on ? 'strong' : 'body'}>{item.name}</AppText>
                  {on ? <Feather name="check" size={20} color={colors.clay} /> : null}
                </Pressable>
              )
            }}
            ListFooterComponent={
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <AppText variant="small">You can choose more than one area.</AppText>
                <Button title="Done" onPress={onClose} />
                <AppText variant="small" style={{ fontSize: 12 }}>
                  Your location is saved only on this phone. We use it to find shops near you and don’t store it on our servers.
                </AppText>
              </View>
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
