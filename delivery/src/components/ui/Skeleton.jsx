import { View } from 'react-native'
import { colors, radius } from '../../theme'

// A quiet grey block that holds a place while something loads.
export default function Skeleton({ height = 16, width = '100%', style }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: radius.md, backgroundColor: colors.sand }, style]} />
}
