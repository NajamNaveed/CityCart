import { Text, View } from 'react-native'
import { colors, radius } from '../../theme'

// The clay count bubble: chat unread in the list, badge counts on the Account tab.
export default function UnreadPill({ count, label }) {
  if (!count || count < 1) return null
  return (
    <View accessibilityLabel={label || `${count} unread`} style={{ minWidth: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.clay, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
      <Text maxFontSizeMultiplier={1} style={{ color: colors.white, fontFamily: 'Poppins_600SemiBold', fontSize: 12 }}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  )
}
