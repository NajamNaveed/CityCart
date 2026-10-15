import { Text } from 'react-native'
import { colors, fonts } from '../../theme'

// One place that decides how text looks. Sizes follow the web app; text still
// grows with the phone's font-size setting, up to 1.3x so layouts hold.
const VARIANTS = {
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.ink },
  strong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink },
}

export default function AppText({ variant = 'body', style, children, ...rest }) {
  return (
    <Text maxFontSizeMultiplier={1.3} style={[VARIANTS[variant], style]} {...rest}>
      {children}
    </Text>
  )
}
