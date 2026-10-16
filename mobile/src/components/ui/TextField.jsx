import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors, fonts, minTouch, radius, spacing } from '../../theme'
import AppText from './AppText'

// A labelled text box with an inline error. With `secure` it is a password box
// with a show/hide toggle. Pass autoComplete / textContentType so the phone's
// password manager and autofill can help.
export default function TextField({ label, error, secure = false, ref, style, ...inputProps }) {
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)

  const borderColor = error ? colors.danger : focused ? colors.ink : colors.line

  return (
    <View style={style}>
      <AppText variant="label" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: minTouch,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          paddingLeft: spacing.md,
        }}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure && !shown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: 1, minHeight: minTouch - 2, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingRight: spacing.md }}
          {...inputProps}
        />
        {secure ? (
          <Pressable
            onPress={() => setShown((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Hide password' : 'Show password'}
            hitSlop={8}
            style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name={shown ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="small" accessibilityLiveRegion="polite" style={{ color: colors.danger, marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  )
}
