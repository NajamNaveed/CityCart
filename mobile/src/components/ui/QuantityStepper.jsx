import { Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './AppText'
import { colors, minTouch, radius } from '../../theme'

// − 2 +  with 48-point buttons. `label` names the product for screen readers.
export default function QuantityStepper({ value, onChange, min = 1, max = 99, disabled = false, label = 'quantity' }) {
  const button = (name, action, off, spoken) => (
    <Pressable
      onPress={action}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: off }}
      hitSlop={4}
      style={{ width: minTouch - 8, height: minTouch - 8, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.35 : 1 }}
    >
      <Feather name={name} size={18} color={colors.ink} />
    </Pressable>
  )

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, alignSelf: 'flex-start' }}>
      {button('minus', () => onChange(value - 1), disabled || value <= min, `Decrease ${label}`)}
      <AppText variant="strong" accessibilityLiveRegion="polite" accessibilityLabel={`${value}`} style={{ minWidth: 32, textAlign: 'center' }}>
        {value}
      </AppText>
      {button('plus', () => onChange(value + 1), disabled || value >= max, `Increase ${label}`)}
    </View>
  )
}
