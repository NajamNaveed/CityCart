import { Text } from 'react-native'
import { colors, weights } from '../../theme'

// One place that decides how text looks. Text still grows with the phone's
// font-size setting, up to 1.3x so layouts hold.
const VARIANTS = {
  body: { fontWeight: weights.regular, fontSize: 16, lineHeight: 23, color: colors.ink },
  small: { fontWeight: weights.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontWeight: weights.medium, fontSize: 14, lineHeight: 19, color: colors.ink },
  strong: { fontWeight: weights.semibold, fontSize: 16, lineHeight: 23, color: colors.ink },
  heading: { fontWeight: weights.bold, fontSize: 20, lineHeight: 27, color: colors.ink },
  title: { fontWeight: weights.bold, fontSize: 28, lineHeight: 34, color: colors.ink },
  big: { fontWeight: weights.bold, fontSize: 34, lineHeight: 40, color: colors.ink },
}

export default function AppText({ variant = 'body', style, children, ...rest }) {
  return (
    <Text maxFontSizeMultiplier={1.3} style={[VARIANTS[variant], style]} {...rest}>
      {children}
    </Text>
  )
}
