import { View } from 'react-native'
import { colors, radius, spacing } from '../../theme'

export default function Card({ children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
