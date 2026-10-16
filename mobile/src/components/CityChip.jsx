import { useState } from 'react'
import { Pressable } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import OptionSheet from './ui/OptionSheet'
import { useCity } from '../hooks/useCity'
import { colors, radius, spacing } from '../theme'

// "Faisalabad ▾": shows the city being shopped in and lets the shopper change it.
export default function CityChip() {
  const { cities, city, cityId, setCityId } = useCity()
  const [open, setOpen] = useState(false)
  const options = [{ value: '', label: 'All cities' }, ...cities.map((c) => ({ value: c._id, label: c.name }))]

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`City: ${city ? city.name : 'all cities'}. Change`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: 40,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        <Feather name="map-pin" size={15} color={colors.clay} />
        <AppText variant="label" numberOfLines={1} style={{ maxWidth: 130 }}>
          {city ? city.name : 'All cities'}
        </AppText>
        <Feather name="chevron-down" size={15} color={colors.muted} />
      </Pressable>
      <OptionSheet
        visible={open}
        title="Shop in"
        options={options}
        selected={cityId}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          setCityId(id)
          setOpen(false)
        }}
      />
    </>
  )
}
