import { View } from 'react-native'
import AppText from './AppText'
import { spacing } from '../../theme'

// A label on the left, its value on the right. Both may wrap, so a long product
// name or reference can never push the other one off the card.
export default function DetailRow({ label, value, bold }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant={bold ? 'strong' : 'small'} style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant={bold ? 'strong' : 'label'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  )
}
