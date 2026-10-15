import { ActivityIndicator, Pressable } from 'react-native'
import { colors, minTouch, radius, spacing } from '../../theme'
import AppText from './AppText'

const LOOKS = {
  dark: { bg: colors.ink, pressed: colors.inkSoft, text: colors.white, border: colors.ink },
  clay: { bg: colors.clay, pressed: colors.clayDark, text: colors.white, border: colors.clay },
  outline: { bg: 'transparent', pressed: colors.sand, text: colors.ink, border: colors.ink },
}

// Always at least 48 points tall, so it is easy to hit with a thumb.
export default function Button({ title, onPress, variant = 'dark', loading = false, disabled = false, style }) {
  const look = LOOKS[variant]
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        {
          minHeight: minTouch,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: look.border,
          backgroundColor: pressed ? look.pressed : look.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          opacity: inactive ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={look.text} />
      ) : (
        <AppText variant="label" style={{ color: look.text, fontSize: 15 }}>
          {title}
        </AppText>
      )}
    </Pressable>
  )
}
