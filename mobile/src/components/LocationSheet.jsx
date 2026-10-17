import { useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import Button from './ui/Button'
import SearchBar from './ui/SearchBar'
import Spinner from './ui/Spinner'
import { useCity } from '../hooks/useCity'
import { useNearby } from '../hooks/useNearby'
import { colors, minTouch, radius, spacing } from '../theme'

const MESSAGES = {
  timeout: 'Finding your location took too long. Try again, or choose your area below.',
  servicesOff: 'Location is switched off on this phone. Turn it on and try again, or choose your area below.',
  outside: "We don't serve your current location yet. Choose a city and area below.",
  error: "We couldn't find your location. Choose your area below.",
}

/**
 * "Where are you shopping?": use my location, or pick a city and an area by hand.
 * The phone's own permission prompt only appears when the shopper taps the button.
 */
export default function LocationSheet({ visible, onClose }) {
  const { cities, cityId, setCityId } = useCity()
  const { blocks, blocksReady, blockId, status, canAskAgain, detect, chooseBlock, clearLocation } = useNearby()
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? blocks.filter((b) => b.name.toLowerCase().includes(needle)) : blocks
  }, [blocks, search])

  async function useMyLocation() {
    if ((await detect()) === 'found') onClose()
  }

  const blocked = status === 'denied' && !canAskAgain
  const message =
    status === 'denied'
      ? canAskAgain
        ? 'Location permission was not given. You can choose your area below.'
        : 'Location is blocked for CityCart. Turn it on in Settings, or choose your area below.'
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.45)' }} />
      <SafeAreaView edges={['bottom']} style={{ height: '82%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          </View>

          {!cityId ? (
            <AppText variant="small" style={{ paddingHorizontal: spacing.lg }}>
              Pick a city to see its areas.
            </AppText>
          ) : !blocksReady ? (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Spinner label="Loading areas…" />
            </View>
          ) : blocks.length === 0 ? (
            <AppText variant="small" style={{ paddingHorizontal: spacing.lg }}>
              No areas have been set up for this city yet.
            </AppText>
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(b) => b._id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Pressable onPress={() => { clearLocation(); onClose() }} accessibilityRole="radio" accessibilityState={{ selected: !blockId }} style={rowStyle(!blockId)}>
                  <AppText variant={!blockId ? 'strong' : 'body'}>Whole city (no specific area)</AppText>
                  {!blockId ? <Feather name="check" size={20} color={colors.clay} /> : null}
                </Pressable>
              }
              ListEmptyComponent={
                <AppText variant="small" style={{ padding: spacing.lg }}>
                  No area matches “{search}”.
                </AppText>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    chooseBlock(item._id)
                    onClose()
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: blockId === item._id }}
                  style={rowStyle(blockId === item._id)}
                >
                  <AppText variant={blockId === item._id ? 'strong' : 'body'}>{item.name}</AppText>
                  {blockId === item._id ? <Feather name="check" size={20} color={colors.clay} /> : null}
                </Pressable>
              )}
            />
          )}

          <AppText variant="small" style={{ padding: spacing.lg, fontSize: 12 }}>
            Your location is saved only on this phone. We use it to find shops near you and don’t store it on our servers.
          </AppText>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
