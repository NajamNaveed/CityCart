import { View } from 'react-native'
import AppText from './ui/AppText'
import { colors } from '../theme'

// A rating as five stars filled in proportion to the value (4.3 fills four and a bit).
// A screen reader says "4.3 out of 5" instead of reading five star symbols.
export default function Stars({ value = 0, size = 14 }) {
  const percent = (Math.max(0, Math.min(5, value)) / 5) * 100
  const row = { fontSize: size, lineHeight: size + 4, letterSpacing: 1 }
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${Number(value).toFixed(1)} out of 5`} style={{ alignSelf: 'flex-start' }}>
      <AppText style={[row, { color: colors.line }]}>★★★★★</AppText>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percent}%`, overflow: 'hidden' }}>
        <AppText numberOfLines={1} style={[row, { color: colors.clay, width: 200 }]}>
          ★★★★★
        </AppText>
      </View>
    </View>
  )
}
