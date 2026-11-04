import { ActivityIndicator, Pressable } from 'react-native'
import { colors, minTouch, radius, spacing } from '../../theme'
import AppText from './AppText'

const LOOKS = {
  pine: { bg: colors.pine, pressed: colors.pineDark, text: colors.white, border: colors.pine },
  outline: { bg: 'transparent', pressed: colors.sand, text: colors.ink, border: colors.ink },
  danger: { bg: 'transparent', pressed: colors.dangerSoft, text: colors.danger, border: colors.danger },
}

// Always at least 52 points tall, so it is easy to hit with a thumb.
export default function Button({ title, onPress, variant = 'pine', loading = false, disabled = false, style }) {
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
        <AppText variant="label" style={{ color: look.text, fontSize: 16 }}>
          {title}
        </AppText>
      )}
    </Pressable>
  )
}
